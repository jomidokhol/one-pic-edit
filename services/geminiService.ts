import { GoogleGenAI, Type } from "@google/genai";
import { DetectedText } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please set the API_KEY environment variable in Vercel.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Step 1: Detect text and bounding boxes in the image.
 * Enhanced for Bengali script detection.
 */
export const analyzeImageText = async (base64Image: string): Promise<DetectedText[]> => {
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
          text: `Locate all text strings in this image. This image may contain Bengali (Bangla) script. 
          For each string, provide the exact text content (preserving Bengali characters and conjuncts) and its bounding box. 
          The bounding box should be normalized from 0 to 1000: [ymin, xmin, ymax, xmax].
          Return ONLY a JSON array of objects. Example: [{"text": "হ্যালো", "boundingBox": [100, 200, 150, 400]}]`,
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

  try {
    const textOutput = response.text;
    if (!textOutput) throw new Error("Empty response from AI");
    
    // Strip potential markdown code blocks if the model includes them erroneously
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
  } catch (error) {
    console.error("Failed to parse Gemini OCR response:", error);
    throw error; // Rethrow to let the UI catch and display the error
  }
};

/**
 * Step 2: Edit the image to replace text with custom styling, including stroke and font size.
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
  const ai = getAIClient();
  const base64Data = base64Image.split(',')[1];

  const fontInstruction = font !== "original" ? `Use the font style "${font}". If the text is in Bengali, ensure the font supports complex Bengali conjuncts (yuktakshar) and vowel signs (kar).` : "Match the original font style exactly.";
  const colorInstruction = color !== "original" ? `Use the hex color "${color}" for the text fill.` : "Match the original text color exactly.";
  const strokeInstruction = strokeColor !== "none" && strokeWidth > 0 
    ? `Apply a visible text outline/stroke with the color "${strokeColor}" and a thickness of approximately ${strokeWidth} pixels.` 
    : "Do not add any additional stroke or outline unless it was in the original image.";
  const sizeInstruction = fontSize !== 100 
    ? `Scale the text size to ${fontSize}% of the original text's height. Ensure it still fits naturally within the design context.` 
    : "Keep the font size consistent with the original text.";

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
          text: `Please edit this image. Replace the text "${originalText}" located in the area [${box.ymin}, ${box.xmin}, ${box.ymax}, ${box.xmax}] with the new text: "${newText}". 
          ${fontInstruction} ${colorInstruction} ${strokeInstruction} ${sizeInstruction}
          If the new text is in Bengali, ensure the rendering is linguistically correct with all vowel markers and compound characters properly placed.
          The background texture, lighting, and shadow must be maintained exactly so the edit is indistinguishable from reality. The new text should blend perfectly into the scene.`,
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
};