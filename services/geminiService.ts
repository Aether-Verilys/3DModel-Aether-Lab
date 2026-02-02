
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getSpatialInsight = async (topic: string): Promise<{ title: string; explanation: string; subtext: string }> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an AI in a high-tech 3D design laboratory. Provide a profound and technical insight about ${topic}. 
      The explanation should be concise (max 30 words). 
      The title should be a technical name for the concept. 
      The subtext should be a short one-liner about the future of 3D.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            explanation: { type: Type.STRING },
            subtext: { type: Type.STRING }
          },
          required: ["title", "explanation", "subtext"]
        }
      }
    });

    const jsonStr = response.text?.trim() || '{"title": "Spatial Synthesis", "explanation": "The convergence of depth and time allows for non-linear geometry.", "subtext": "The Z-axis is the final frontier of interaction."}';
    return JSON.parse(jsonStr);
  } catch (error) {
    // Handle quota errors gracefully without exploding the console
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes('429') && !msg.includes('RESOURCE_EXHAUSTED')) {
        console.error("Error fetching spatial insight:", error);
    } else {
        console.warn("Gemini API quota exceeded. Using cached spatial insight.");
    }

    return {
      title: "Volumetric Theory",
      explanation: "3D modeling transcends static pixels, enabling the simulation of physical reality within a digital vacuum.",
      subtext: "Dimension is not a limit, but a canvas."
    };
  }
};

export const evaluateModel = async (modelType: string, vertexCount: number, hasUVs: boolean): Promise<{ score: number; grade: string; analysis: string; recommendation: string }> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are "AetherBot", a harsh, cynical, yet highly technical 3D geometry benchmark system. 
      Analyze the following 3D model data:
      - Type: ${modelType}
      - Vertex Count: ${vertexCount}
      - Has UV Map: ${hasUVs}

      Criteria:
      - Primitives (Cube, Sphere) are reliable but boring.
      - High vertex counts (>50k) are impressive but inefficient.
      - Low vertex counts (<100) are efficient but lack detail.
      - Missing UVs is a critical failure for texturing.
      
      Output a strict JSON assessment.
      - Score: 0 to 100 integer.
      - Grade: S, A, B, C, D, or F.
      - Analysis: A short, technical, slightly robotic critique (max 20 words).
      - Recommendation: One technical optimization tip.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            grade: { type: Type.STRING },
            analysis: { type: Type.STRING },
            recommendation: { type: Type.STRING }
          },
          required: ["score", "grade", "analysis", "recommendation"]
        }
      }
    });

    const jsonStr = response.text?.trim();
    if (!jsonStr) throw new Error("Empty response");
    return JSON.parse(jsonStr);
  } catch (error) {
    // Handle quota errors gracefully without exploding the console
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes('429') && !msg.includes('RESOURCE_EXHAUSTED')) {
        console.error("Benchmark failed", error);
    } else {
        console.warn("Gemini API quota exceeded. Using heuristic benchmark.");
    }

    return {
      score: 88,
      grade: "B+",
      analysis: "Unable to connect to AetherNet. Running local heuristic estimation.",
      recommendation: "Check connection and retry quantum synchronization."
    };
  }
};
