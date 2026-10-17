import { understandTravelPrompt } from "../../intentParser.js";

export async function understandPromptTool({ message }) {
  return understandTravelPrompt({ prompt: message });
}
