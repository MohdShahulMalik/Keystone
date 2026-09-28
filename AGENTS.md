<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Things to NEVER do
  - DON'T try to access the .env file or any other sensitive files. This is a security risk and will not work in production. Don't try to access it through the cat command, the read tool you have, or just any other means that's possible.

# Things to keep in mind
 - This project utilize "bun" and not npm, always use bun commands and not npm or npx commands

## Intructions When Asked A Question
 - DON'T just go and start changing or writting code in the codebase, use every other tool than that the write tool and ONLY answer the question!
 - DON'T make assumptions about things that you are not sure about, if you are not sure about something then just ask me and I will clarify it for you.
