import { GoogleGenAI, Type } from "@google/genai";
import { DetectedText } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey.includes('AIzaSyDGqhNJvy5jliliZCMlFNtwQGQUT9lAqnc')) {
    throw new Error("Your API key is missing or has been disabled (leaked). Please generate a NEW key in AI Studio and update your Vercel Environment Variables.");
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
    if (error.message?.includes("leaked") || error.status === "PERMISSION_DENIED") {
      throw new Error("SECURITY ALERT: Your API key was disabled because it was leaked. Please create a NEW key at ai.google.dev and update your environment variables.");
    }
    console.error("Gemini Error:", error);
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

    const fontInstruction = font !== "original" ? `Use font style: "${font}".` : "Match original font.";
    const colorInstruction = color !== "original" ? `Use hex color: "${color}".` : "Match original color.";
    const strokeInstruction = strokeColor !== "none" ? `Add ${strokeWidth}px stroke of color ${strokeColor}.` : "";
    const sizeInstruction = `Font size: ${fontSize}% of original.`;

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
            text: `Edit this image. Replace "${originalText}" at [${box.ymin}, ${box.xmin}, ${box.ymax}, ${box.xmax}] with "${newText}". ${fontInstruction} ${colorInstruction} ${strokeInstruction} ${sizeInstruction} Maintain background and lighting perfectly.`,
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
    if (error.message?.includes("leaked")) {
      throw new Error("SECURITY ALERT: Leaked API key. Update your variables on Vercel.");
    }
    throw error;
  }
};