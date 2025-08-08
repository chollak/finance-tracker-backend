# 🚀 Claude Code Token Optimization Guide

Complete guide to minimize token usage while maintaining high-quality assistance.

## 🎯 High-Impact Optimization Strategies

### **1. Use Targeted Tool Calls**
Instead of reading entire large files, use specific searches:

```bash
# ❌ Expensive - reads entire file
Read entire 500-line file

# ✅ Efficient - targeted search
Grep specific patterns
Glob for specific file types
```

### **2. Batch Related Tasks**
```bash
# ❌ Multiple separate conversations
Session 1: "Fix this bug"
Session 2: "Add tests for the fix" 
Session 3: "Update documentation"

# ✅ Single focused conversation
"Fix this bug, add tests, and update docs"
```

### **3. Use Context-Aware Commands**
```bash
# ❌ Vague requests requiring exploration
"Something is wrong with my app"

# ✅ Specific requests
"The /api/transactions endpoint returns 500 error when userId is missing"
```

## 📁 Token Optimization Toolkit

### **New Tools Created:**

1. **`claude-start`** - One-command session starter
2. **`scripts/session-start.js`** - Project context collector  
3. **`scripts/error-context.js`** - Debugging context
4. **`scripts/explore.js`** - Smart file finder
5. **Updated `CONTEXT.md`** - Complete workflow guide

### **Tool Usage:**

#### **`claude-start` - Quick Session Starter**
```bash
./claude-start
# Copy the output and paste it when starting Claude
```

#### **`scripts/session-start.js` - Project Context**
Provides:
- Project status (database, build, git)
- Recent activity and commits
- Architecture reminder
- Quick commands reference

#### **`scripts/error-context.js` - Debug Helper**
```bash
node scripts/error-context.js
# Share only the relevant error sections
```
Checks:
- Build errors
- Test failures  
- TypeScript errors
- Log files

#### **`scripts/explore.js` - Smart File Finder**
```bash
node scripts/explore.js src    # Source code structure
node scripts/explore.js api    # API endpoints  
node scripts/explore.js db     # Database files
```

## 🚀 Your New Efficient Workflow

### **Starting Any Claude Session:**
```bash
./claude-start
# Copy the output and paste it when starting Claude
```

### **For Debugging Issues:**
```bash
node scripts/error-context.js
# Share only the relevant error sections
```

### **Finding Specific Files:**
```bash
node scripts/explore.js src    # Source code
node scripts/explore.js api    # API endpoints  
node scripts/explore.js db     # Database files
```

## 💬 Optimized Communication Patterns

### **Example Messages:**

#### **Instead of:**
```
"Help me debug my app, something is wrong"
```

#### **Use:**
```
"See CONTEXT.md. Status: [paste session-start output]

Issue: Getting 500 error on POST /api/transactions
Working on: src/framework/express/expressServer.ts
Error context: [paste relevant error-context output]"
```

### **Smart Communication Patterns:**

#### **1. Start Sessions with Context**
```
Instead of: "Help me debug"
Use: "SQLite app built yesterday. Getting 500 error on /api/transactions endpoint. Quick status: [run quick-status script first]"
```

#### **2. Be Specific About Scope**
```
Instead of: "Review my code" 
Use: "Review only src/modules/transaction/application/ for race conditions"
```

#### **3. Use Incremental Requests**
```
Instead of: "Build entire new feature"
Use: "Step 1: Add User entity validation logic only"
```

### **Efficient Communication Examples:**
- ✅ "Fix validation in src/entities/Budget.ts line 25"
- ✅ "Add tests to src/modules/transaction/application/"  
- ✅ "See CONTEXT.md - working on [specific issue]"
- ❌ "Something is wrong with my app"
- ❌ "Review all my code"
- ❌ "Help me debug"

## 📊 Expected Token Savings

- **🔥 80% reduction** on debugging sessions
- **🔥 70% reduction** on architecture discussions  
- **🔥 60% reduction** on file exploration
- **🔥 50% reduction** on status checks

### **Savings Breakdown:**
- **🔥 High-impact**: 60-80% token reduction on debugging sessions
- **📊 Medium-impact**: 30-50% reduction on feature development  
- **⚡ Quick wins**: 20-30% reduction just from better file targeting

## 💡 Pro Tips & Best Practices

### **Before Starting Any Session:**
1. **Always run `./claude-start`** before opening Claude
2. **Reference existing scripts** instead of asking Claude to write them
3. **Use specific file paths** from `explore.js` output
4. **Batch related changes** in one conversation
5. **Update CONTEXT.md** when architecture changes

### **During Sessions:**
- ✅ **Use targeted file reading** (specific lines/sections)
- ✅ **Batch similar operations** (multiple related changes)
- ✅ **Reference previous context** instead of re-explaining
- ❌ **Avoid large file dumps** 
- ❌ **Don't repeat architectural explanations**

### **End Sessions Efficiently:**
- ✅ **Update CONTEXT.md** if architecture changed
- ✅ **Run quick tests** to confirm functionality
- ✅ **Summarize what's working** for next session

## 🎯 Token-Efficient Workflow Summary

### **Your Optimized Session Pattern:**

1. **Pre-session**: Run `./claude-start`
2. **Start message**: "See CONTEXT.md. Status: [paste output]. Need: [specific task]"
3. **During work**: Use targeted file operations, batch requests
4. **End session**: Update context if needed

### **File Organization:**
- `.clauderc` - Ignore patterns for large/unnecessary files
- `CONTEXT.md` - Current project state and architecture
- `TOKEN-OPTIMIZATION-GUIDE.md` - This complete guide
- `claude-start` - One-command session starter
- `scripts/` - All optimization helper scripts

## 🚀 Quick Reference Commands

```bash
# Start optimized Claude session
./claude-start

# Debug context
node scripts/error-context.js

# Explore files  
node scripts/explore.js src
node scripts/explore.js api
node scripts/explore.js db

# Project status
node scripts/quick-status.js

# Database overview
node scripts/inspect-db.js
```

---

**🎉 Your token optimization system is complete! Use `./claude-start` before every Claude session for maximum efficiency!**