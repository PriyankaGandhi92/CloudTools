import type { BIMType, BIMDialogData } from '../types';

export async function analyzeBimImage(
  apiKey: string,
  imageBase64: string,
  bimType: BIMType,
): Promise<BIMDialogData> {
  const prompts: Record<BIMType, string> = {
    door: `Analyze this image of a door and extract the following information in JSON format:
{
  "doorType": "one of: Single, Double, Sliding, Folding, Revolving",
  "doorWidth": "width as string, e.g., '36 inches' or '3 ft'",
  "doorHeight": "height as string, e.g., '80 inches' or '6'8\"",
  "doorMaterial": "material, e.g., Wood, Steel, Glass",
  "doorFireRating": "fire rating if visible, e.g., '30 min', '60 min'",
  "doorManufacturer": "manufacturer name if visible",
  "notes": "any other observations about the door"
}
Only return the JSON object, no markdown, no explanation. If a field cannot be determined from the image, set it to null or empty string.`,
    
    wall: `Analyze this image of a wall and extract the following information in JSON format:
{
  "wallType": "one of: Load-bearing, Partition, Curtain, Shear, Retaining",
  "wallThickness": "thickness as string, e.g., '4 inches' or '6 inches'",
  "wallHeight": "height as string, e.g., '8 ft' or '10 ft'",
  "wallMaterial": "material, e.g., Concrete, Brick, Drywall",
  "wallInsulation": "insulation type if visible, e.g., 'R-13', 'R-19'",
  "wallFireRating": "fire rating if visible, e.g., '1-hour', '2-hour'",
  "notes": "any other observations about the wall"
}
Only return the JSON object, no markdown, no explanation. If a field cannot be determined from the image, set it to null or empty string.`,
    
    supplier: `Analyze this image and extract supplier information in JSON format:
{
  "supplierName": "company name",
  "supplierContact": "phone, email, or website",
  "supplierCategory": "product category, e.g., HVAC, Electrical, Plumbing",
  "notes": "any other observations about the supplier"
}
Only return the JSON object, no markdown, no explanation. If a field cannot be determined from the image, set it to null or empty string.`,
    
    'fire-rating': `Analyze this image for fire rating information and extract in JSON format:
{
  "fireRatingValue": "fire rating, e.g., '1-hour', '2-hour', '3-hour'",
  "assemblyType": "one of: Wall, Floor, Ceiling, Roof",
  "testedAssembly": "tested assembly designation if visible, e.g., 'UL Design U301'",
  "notes": "any other observations about the fire rating"
}
Only return the JSON object, no markdown, no explanation. If a field cannot be determined from the image, set it to null or empty string.`,
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompts[bimType] },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = rawText.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let result: Partial<BIMDialogData>;
  try {
    result = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${jsonStr.slice(0, 200)}`);
  }

  return result as BIMDialogData;
}
