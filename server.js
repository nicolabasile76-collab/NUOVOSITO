const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.join(__dirname, 'images');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(IMAGES_DIR));

// API: get images from a section folder
// Returns array of image filenames for a given section
app.get('/api/images/:section', (req, res) => {
  const section = req.params.section;
  const sectionDir = path.join(IMAGES_DIR, section);

  if (!fs.existsSync(sectionDir)) {
    return res.json([]);
  }

  const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'];
  const files = fs.readdirSync(sectionDir)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return validExts.includes(ext) && !f.startsWith('.');
    })
    .sort()
    .map(f => ({
      name: f,
      url: `/images/${section}/${f}`
    }));

  res.json(files);
});

// API: get all sections and their images
app.get('/api/images', (req, res) => {
  if (!fs.existsSync(IMAGES_DIR)) {
    return res.json({});
  }

  const sections = fs.readdirSync(IMAGES_DIR)
    .filter(d => fs.statSync(path.join(IMAGES_DIR, d)).isDirectory());

  const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'];
  const result = {};

  sections.forEach(section => {
    const sectionDir = path.join(IMAGES_DIR, section);
    result[section] = fs.readdirSync(sectionDir)
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return validExts.includes(ext) && !f.startsWith('.');
      })
      .sort()
      .map(f => ({
        name: f,
        url: `/images/${section}/${f}`
      }));
  });

  res.json(result);
});

// Local dev: listen on port
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  POST Societa Benefit - Sito attivo!`);
    console.log(`  http://localhost:${PORT}\n`);
  });
}

// Export for Vercel
module.exports = app;
