# Progress Update Instructions

## For Claude Code Sessions

When starting a new Claude Code session on any computer:

1. **Read Progress**: Check `CLAUDE.md` in the project root to understand current status
2. **Continue Work**: Use the "Next Task" section to know what to work on
3. **Update Progress**: After completing tasks, update `CLAUDE.md` with:
   - Move completed tasks from pending to completed
   - Update "Last Updated" date
   - Add new session notes
   - Update "Next Task" section

## Quick Update Template

When completing a task, update CLAUDE.md:

```markdown
### ✅ Recently Completed
- [x] **Task X**: [Description] - Completed [date]

### 🚧 Next Task (Priority: HIGH)  
- [ ] **Task Y**: [Next task description]

### Session History
#### Session N ([date])
- Completed Task X: [brief description]
- Key decisions: [any important technical choices]
- Ready for: [next steps]
```

## Git Workflow

After updating CLAUDE.md:
```bash
git add CLAUDE.md
git commit -m "docs: Update progress after completing Task X"
git push
```

This ensures progress is always available for the next Claude session on any computer.