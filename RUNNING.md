# How to Run FS-AUDIO

## Development Mode (Recommended)

**Option 1: Single Command (Easiest)**
```bash
npm start
```
This runs both Vite dev server AND Electron together.

**Option 2: Manual (If Option 1 fails)**
```bash
# Terminal 1: Start Vite dev server
npm run dev

# Terminal 2 (wait for "Local: http://localhost:5173" to appear above):
npm run electron:start
```

## Common Issues

### "A JavaScript error occurred in the main process"
**Problem:** Vite dev server not running or wrong port

**Solution:**
1. Check if port 5173 is already in use:
   ```bash
   lsof -i :5173
   ```
2. Kill any process using it:
   ```bash
   kill -9 <PID>
   ```
3. Try running again:
   ```bash
   npm start
   ```

### "Could not connect to Vite dev server"
**Problem:** Vite didn't start or took too long

**Solution:**
1. Run Vite first manually:
   ```bash
   npm run dev
   ```
2. Wait for "Local: http://localhost:5173" to appear
3. In a NEW terminal, run:
   ```bash
   npm run electron:start
   ```

### "Build Not Found"
**Problem:** Running production mode without building

**Solution:**
```bash
npm run build
npm run electron:start
```

## Production Build

To create a standalone app:
```bash
npm run electron:build
```

The app will be in the `release/` folder.

## Quick Troubleshooting

1. **First time running?**
   ```bash
   npm install
   npm start
   ```

2. **Still not working?**
   ```bash
   # Clean everything
   rm -rf node_modules dist .vite
   npm install
   npm start
   ```

3. **Need to reset?**
   ```bash
   git pull origin main
   npm install
   npm start
   ```
