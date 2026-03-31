---
description: Monitor real-time logs from Vercel and Neon Database.
---

1. Fetch real-time runtime logs from Vercel:
// turbo
mcp_vercel_get_runtime_logs(projectId="prj_F3uqIRgya8yKy7Nup29RyS3z5Jly", teamId="team_fu4rrTKb9MNkoMx9JsLPLp97", limit=20)

2. Fetch latest logs from the Neon database:
// turbo
npx tsx scripts/monitor-db.ts

3. Analyze the results to identify any errors or unusual behavior in the chatbot flow.
