import fs from 'fs';
import path from 'path';

let loadedSkillsText = '';

/**
 * Scans the skills/ directory at the project root for SKILL.md files and
 * aggregates their contents into a single markdown string to be injected
 * into the agent's system prompt.
 */
export async function initSkills() {
    try {
        const skillsDir = path.resolve(process.cwd(), 'skills');
        if (!fs.existsSync(skillsDir)) {
            console.log('[Skills] No skills/ directory found in the project root. Skipping skills loading.');
            return;
        }

        const skillNames = fs.readdirSync(skillsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        let concatenatedSkills = '';
        let loadedCount = 0;

        for (const skillName of skillNames) {
            const skillFilePath = path.join(skillsDir, skillName, 'SKILL.md');
            if (fs.existsSync(skillFilePath)) {
                try {
                    const content = fs.readFileSync(skillFilePath, 'utf-8');
                    concatenatedSkills += `\n\n--- SKILL: ${skillName} ---\n${content.trim()}`;
                    loadedCount++;
                } catch (readError) {
                    console.error(`[Skills] Failed to read SKILL.md for ${skillName}:`, readError);
                }
            }
        }

        if (loadedCount > 0) {
            loadedSkillsText = `\n\n=== LOADED AGENT SKILLS ===${concatenatedSkills}\n=========================\n`;
            console.log(`[Skills] Successfully loaded ${loadedCount} skill(s).`);
        } else {
            console.log('[Skills] Found skills/ directory but no SKILL.md files. No skills loaded.');
        }

    } catch (error) {
        console.error('[Skills] Error initializing skills:', error);
    }
}

/**
 * Returns the aggregated text of all loaded skills to be appended to the agent system prompt.
 */
export function getSkillsPrompt(): string {
    return loadedSkillsText;
}
