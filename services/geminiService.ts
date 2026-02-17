import { GoogleGenAI, Type } from "@google/genai";
import { DetectedText } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  // Note: We don't hardcode the leaked key here anymore, we check for existence
  if (!apiKey) {
    throw new Error("API Key is missing. Please set the API_KEY environment variable in Vercel.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Step 1: Detect text and bounding boxes in the image.
 */
export const analyzeImageText = async (base64Image: string): Promise<DetectedText[]> => {
  try {
    const ai = getAIClient();
    const base64Data = base64Image.split(',')[1];

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data,
            },
          },
          {
            text: `Locate all text strings in this image. Provide the exact text content and its bounding box normalized from 0 to 1000: [ymin, xmin, ymax, xmax]. Return ONLY a JSON array.`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              boundingBox: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "[ymin, xmin, ymax, xmax]"
              }
            },
            required: ["text", "boundingBox"]
          }
        }
      }
    });

    const textOutput = response.text;
    if (!textOutput) throw new Error("Empty response from AI");
    
    const cleanJson = textOutput.replace(/```json|```/g, "").trim();
    const rawJson = JSON.parse(cleanJson || '[]');
    
    return rawJson.map((item: any, index: number) => ({
      id: `text-${index}`,
      text: item.text,
      boundingBox: {
        ymin: item.boundingBox[0],
        xmin: item.boundingBox[1],
        ymax: item.boundingBox[2],
        xmax: item.boundingBox[3],
      },
      confidence: 1.0,
    }));
  } catch (error: any) {
    handleGeminiError(error);
    throw error;
  }
};

/**
 * Step 2: Edit the image to replace text.
 */
export const editImageText = async (
  base64Image: string, 
  originalText: string, 
  newText: string,
  box: DetectedText['boundingBox'],
  font: string = "original",
  color: string = "original",
  strokeColor: string = "none",
  strokeWidth: number = 0,
  fontSize: number = 100
): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const base64Data = base64Image.split(',')[1];

    const fontInstruction = font !== "original" ? `Use font: "${font}".` : "Match font.";
    const colorInstruction = color !== "original" ? `Color: "${color}".` : "Match color.";
    const strokeInstruction = strokeColor !== "none" ? `Stroke: ${strokeWidth}px ${strokeColor}.` : "";
    const sizeInstruction = `Size: ${fontSize}%.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data,
            },
          },
          {
            text: `Replace "${originalText}" at [${box.ymin}, ${box.xmin}, ${box.ymax}, ${box.xmax}] with "${newText}". ${fontInstruction} ${colorInstruction} ${strokeInstruction} ${sizeInstruction} Clean result.`,
          },
        ],
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error: any) {
    handleGeminiError(error);
    throw error;
  }
};

/**
 * Centralized error handling for common Gemini API issues.
 */
const handleGeminiError = (error: any) => {
  console.error("Gemini API Error Detail:", error);
  
  const status = error.status || error.code;
  const message = error.message || "";

  if (status === 429 || message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
    throw new Error("QUOTA EXCEEDED: You've reached the free tier limit for the Gemini API. Please wait a minute or upgrade to a paid plan at ai.google.dev.");
  }
  
  if (status === 403 || message.includes("leaked") || message.includes("PERMISSION_DENIED")) {
    throw new Error("API KEY ERROR: Your key is either invalid, leaked, or restricted. Please check your Vercel Environment Variables.");
  }

  if (message.includes("safety")) {
    throw new Error("SAFETY BLOCK: The AI blocked this request because of content safety filters. Try a different image or text.");
  }
};
