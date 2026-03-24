import { execSync } from 'child_process';

const apiKey = "***REMOVED***";
try {
    // We use standard input to avoid leaking the key in the process list if possible
    execSync('npx vercel env add OPENROUTER_API_KEY production --scope team_fu4rrTKb9MNkoMx9JsLPLp97 --force', {
        input: apiKey,
        stdio: ['pipe', 'inherit', 'inherit']
    });
    console.log("Success: OPENROUTER_API_KEY added without newlines.");
} catch (err) {
    console.error("Failed to add env var:", err);
    process.exit(1);
}
