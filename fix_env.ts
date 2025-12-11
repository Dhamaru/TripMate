
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
const key = 'AIzaSyDIW6mSoxwkQHn6Aj8NI-so5_Z7OwKYByg';

try {
    let content = '';
    if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf-8');
    }

    // Clean up content: ensure newlines
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const newLines = [];
    const keysToAdd = ['GOOGLE_API_KEY', 'GOOGLE_PLACES_API_KEY', 'GEMINI_API_KEY'];

    // Keep existing lines if they aren't the keys we are adding
    for (const line of lines) {
        const [k] = line.split('=');
        if (!keysToAdd.includes(k)) {
            newLines.push(line);
        }
    }

    // Add our keys
    keysToAdd.forEach(k => newLines.push(`${k}=${key}`));

    fs.writeFileSync(envPath, newLines.join('\n'));
    console.log("ENV file fixed. Content preview:");
    console.log(newLines.join('\n'));
} catch (e) {
    console.error(e);
}
