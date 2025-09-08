# Squarespace Deployment Guide - Modular Assessment System

## Overview
This guide shows you how to deploy the modular assessment system to Squarespace. The new system loads modules dynamically from JSON files, making it much more scalable for all 15 modules.

## What You Need to Deploy

### 1. Main HTML File
- **File**: `squarespace-modular.html`
- **Purpose**: Contains the main assessment engine and module grid
- **Size**: ~15KB (much smaller than the old single-file approach)

### 2. Module JSON Files (Hosted on GitHub)
- **File**: `src/modules/module-01.json` (Exposure module)
- **File**: `src/modules/module-02.json` (Aperture module)
- **Purpose**: Contains quiz questions, answers, and feedback for each module
- **Size**: ~3-5KB each
- **Hosting**: GitHub Pages (free, fast, version controlled)

### 3. Engine JavaScript
- **File**: `src/engine.js`
- **Purpose**: Core assessment logic, authentication, PDF generation
- **Size**: ~25KB

## Step-by-Step Deployment

### Step 1: Set Up GitHub Repository for Modules
1. **Create a new GitHub repository** called `alanranger-modules`
2. **Upload the module files** to the repository:
   - `src/modules/module-01.json`
   - `src/modules/module-02.json`
3. **Enable GitHub Pages**:
   - Go to repo **Settings** → **Pages**
   - Select **Deploy from a branch**
   - Choose **main** branch
   - Your modules will be available at: `https://yourusername.github.io/alanranger-modules/modules/module-01.json`

### Step 2: Update the Code with Your GitHub URL
1. **Edit** `src/engine.js` and `squarespace-modular.html`
2. **Replace** `yourusername` with your actual GitHub username in the fetch URLs
3. **Test** that the modules load correctly from GitHub

### Step 3: Create the Assessment Page
1. **Go to Squarespace Admin** → **Pages**
2. **Add a new page** called "Photography Assessment" or similar
3. **Add a Code Block** to the page
4. **Paste the contents** of `squarespace-modular.html` into the code block
5. **Save the page**

### Step 4: Test the System
1. **Visit your assessment page**
2. **Test the module grid** - you should see Module 1 and Module 2
3. **Click "Take exam"** on Module 1 - should load the Exposure quiz from GitHub
4. **Click "Take exam"** on Module 2 - should load the Aperture quiz from GitHub
5. **Test authentication** - sign in with email
6. **Test PDF generation** - download results and certificate
7. **Check browser console** - should see successful fetches from GitHub

## Adding New Modules (Modules 3-15)

### Step 1: Create Module JSON File
1. **Create** `src/modules/module-03.json` (or whatever module number)
2. **Follow the same structure** as the existing modules:
   ```json
   {
     "moduleId": "module-03-shutter",
     "title": "Module 3: Shutter Speed",
     "passMark": 80,
     "links": {
       "article": "https://www.alanranger.com/blog-on-photography/shutter-speed"
     },
     "questions": [
       // 12 questions here
     ],
     "feedbackMap": {
       // Feedback topics and links
     }
   }
   ```

### Step 2: Update Module Registry
1. **Edit** `squarespace-modular.html`
2. **Add the new module** to the `moduleRegistry` object:
   ```javascript
   const moduleRegistry = {
     "module-01-exposure": { /* ... */ },
     "module-02-aperture": { /* ... */ },
     "module-03-shutter": {
       id: "module-03-shutter",
       title: "Shutter Speed",
       article: "https://www.alanranger.com/blog-on-photography/shutter-speed"
     }
   };
   ```

### Step 3: Upload and Test
1. **Upload** the new JSON file to your GitHub repository
2. **Update** the HTML file in your Squarespace code block (if needed)
3. **Test** the new module - it should load automatically from GitHub

## Benefits of the Modular System

### ✅ Scalability
- **Easy to add modules**: Just create a JSON file and update the registry
- **Small file sizes**: Each module is only 3-5KB
- **Fast loading**: Only loads the module you're taking

### ✅ Maintainability
- **Separate concerns**: Quiz content separate from engine logic
- **Easy editing**: Edit questions in JSON files, not HTML
- **Version control**: Track changes to individual modules

### ✅ Performance
- **Cached modules**: Once loaded, modules are cached in memory
- **Lazy loading**: Only loads modules when needed
- **Smaller initial load**: Main HTML file is much smaller

## Troubleshooting

### Module Not Loading
- **Check file URLs**: Make sure JSON files are accessible
- **Check file structure**: Ensure JSON is valid
- **Check browser console**: Look for fetch errors

### Authentication Issues
- **Check Supabase keys**: Make sure they're correct
- **Check network**: Ensure Supabase is accessible
- **Check user permissions**: Make sure RLS policies are set up

### PDF Generation Issues
- **Check image URLs**: Make sure logo and signature images are accessible
- **Check browser support**: Some older browsers don't support jsPDF
- **Check file permissions**: Make sure images can be loaded

## File Structure

### GitHub Repository (for modules)
```
https://yourusername.github.io/alanranger-modules/
├── modules/
│   ├── module-01.json
│   ├── module-02.json
│   └── module-03.json (when you add it)
```

### Squarespace (for main app)
```
yoursite.com/
└── assessment-page (code block with squarespace-modular.html)
```

### Benefits of GitHub Hosting
- ✅ **Free hosting** - No cost for serving JSON files
- ✅ **Version control** - Track all changes to quiz content
- ✅ **Easy updates** - Just push changes, no manual uploads
- ✅ **Better performance** - GitHub's CDN is faster
- ✅ **No file limits** - Unlike Squarespace's storage limits
- ✅ **Direct URLs** - Clean, predictable URLs for each module

## Next Steps
1. **Deploy the current system** with Module 1 and Module 2
2. **Test thoroughly** to ensure everything works
3. **Add Module 3** when ready (Shutter Speed)
4. **Continue adding modules** one by one
5. **Monitor performance** and user feedback

This modular approach will make it much easier to manage all 15 modules as you build them out!
