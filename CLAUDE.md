# ThaOCR — notes for Claude

## Git: `main` is the only branch

- All work goes to `main`. When a change is done and checked, commit it and push `main`.
- If the session starts on another branch (for example `claude/...`), merge that work into `main`
  before the session ends (fast-forward when possible) and push `main`. Do not leave work only on another branch.
- Before pushing, `git fetch origin` and bring in the latest `origin/main` (merge or rebase your local commits).
  Never force-push `main`.
- Do not create other long-lived branches.

## Project

See README.md: a static, client-only site (index.html, app.js, app.css, docview.js, export.js, ocr/). No build step.
Run locally with `python3 serve.py 8020`.
