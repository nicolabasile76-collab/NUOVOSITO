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

// Parse JSON bodies
app.use(express.json());

// ═══ API: CONTACT (Brevo) ═══
app.post('/api/contact', async (req, res) => {
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_KEY) return res.status(500).json({ error: 'Brevo API key not configured' });

  const { nome, email, organizzazione, ruolo, messaggio } = req.body;
  if (!email || !messaggio) return res.status(400).json({ error: 'Email e messaggio obbligatori' });

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender: { name: nome || 'Sito POST', email: 'noreply@postsb.it' },
        to: [{ email: 'info@postsb.it', name: 'POST Società Benefit' }],
        replyTo: { email: email, name: nome || '' },
        subject: `[Sito POST] Nuovo messaggio da ${nome || email}${ruolo ? ' — ' + ruolo : ''}`,
        htmlContent: `
          <h2>Nuovo contatto dal sito</h2>
          <p><strong>Nome:</strong> ${nome || '-'}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Organizzazione:</strong> ${organizzazione || '-'}</p>
          <p><strong>Ruolo:</strong> ${ruolo || '-'}</p>
          <hr/>
          <p>${messaggio.replace(/\n/g, '<br/>')}</p>
        `
      })
    });
    if (response.ok) {
      res.json({ success: true });
    } else {
      const err = await response.text();
      res.status(500).json({ error: 'Errore invio email', details: err });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ CONTEXT INJECTION: Load all site content at startup ═══
let siteContext = '';

function loadSiteContext() {
  const publicDir = path.join(__dirname, 'public');
  const pages = [
    'index.html', 'valutazione-impatto.html', 'amministrazione-condivisa.html',
    'consulenza-organizzativa.html', 'dati-intelligenza-artificiale.html',
    'piani-di-zona.html', 'valutapp.html', 'wait.html', 'articolo.html'
  ];

  let context = '';

  // Extract text from HTML pages
  pages.forEach(page => {
    const filePath = path.join(publicDir, page);
    if (fs.existsSync(filePath)) {
      const html = fs.readFileSync(filePath, 'utf8');
      // Strip HTML tags, scripts, styles — keep only text content
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 50) {
        const pageName = page.replace('.html', '').replace(/-/g, ' ').toUpperCase();
        context += `\n\n--- PAGINA: ${pageName} ---\n${text.substring(0, 3000)}`;
      }
    }
  });

  // Load team.json
  const teamPath = path.join(publicDir, 'team.json');
  if (fs.existsSync(teamPath)) {
    try {
      const team = JSON.parse(fs.readFileSync(teamPath, 'utf8'));
      context += '\n\n--- TEAM COMPLETO ---\n';
      team.forEach(p => {
        context += `\n${p.name} (${p.role}): ${p.intro}`;
        if (p.bio) context += '\n' + p.bio.join(' ');
        if (p.tags) context += '\nCompetenze: ' + p.tags.join(', ');
        if (p.linkedin) context += '\nLinkedIn: ' + p.linkedin;
      });
    } catch(e) {}
  }

  // Load blog.json
  const blogPath = path.join(publicDir, 'blog.json');
  if (fs.existsSync(blogPath)) {
    try {
      const posts = JSON.parse(fs.readFileSync(blogPath, 'utf8'));
      context += '\n\n--- ARTICOLI E ESPERIENZE ---\n';
      posts.forEach(p => {
        context += `\n- "${p.title}" (${p.catLabel}, ${p.date}, ${p.author}): ${p.excerpt}`;
        if (p.tags) context += ' [' + p.tags.join(', ') + ']';
      });
    } catch(e) {}
  }

  // Load extra context file (contesto-post.txt)
  const extraPath = path.join(publicDir, 'contesto-post.txt');
  if (fs.existsSync(extraPath)) {
    const extra = fs.readFileSync(extraPath, 'utf8');
    // Strip comment lines starting with #
    const cleanExtra = extra.split('\n').filter(l => !l.startsWith('#')).join('\n').trim();
    if (cleanExtra.length > 10) {
      context += '\n\n--- INFORMAZIONI AGGIUNTIVE (non presenti nel sito) ---\n' + cleanExtra;
    }
  }

  siteContext = context;
  console.log(`  Contesto sito caricato: ${Math.round(context.length / 1024)}KB di testo\n`);
}

// Load context at startup
loadSiteContext();

// ═══ API: CHAT (Claude with full site context) ═══
app.post('/api/chat', async (req, res) => {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Messaggio obbligatorio' });

  const systemPrompt = `Sei l'assistente del sito di POST Società Benefit, una piccola società di consulenza per il welfare, le politiche pubbliche e lo sviluppo territoriale, con sede a Milano.

ISTRUZIONI:
- Rispondi SOLO in italiano
- NON usare MAI formattazione markdown: no asterischi, no trattini per elenchi, no simboli. Scrivi in testo piano, come un messaggio WhatsApp a un collega
- Se devi elencare cose, usa virgole o "punto e virgola" in una frase, non liste puntate
- Tono: artigianale, concreto, diretto, anti-corporate — come parlerebbe un consulente esperto a un collega
- Risposte brevi: 2-5 frasi massimo, a meno che la domanda non richieda più dettaglio
- Basa le tue risposte ESCLUSIVAMENTE sui contenuti del sito riportati sotto
- NON inventare servizi, progetti, numeri o informazioni che non trovi nel contesto
- Se non trovi la risposta nel contesto, suggerisci di contattare info@postsb.it o +39 3939993731
- Quando parli dei servizi, sii specifico: cita nomi di progetti, strumenti (Valutapp, wAIt), normative (Legge 167/2025, CdTS)
- Se l'utente chiede qualcosa fuori dall'ambito di POST (es. meteo, politica), rispondi gentilmente che puoi aiutare solo su temi legati ai servizi di POST

CONTENUTI DEL SITO POST:
${siteContext}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const reply = data.content?.[0]?.text || 'Mi dispiace, non sono riuscito a generare una risposta.';
      res.json({ reply });
    } else {
      const err = await response.text();
      console.error('Claude API error:', err);
      res.json({ reply: 'Non ho una risposta pronta. Scrivi a info@postsb.it o usa il form contatti.', fallback: true });
    }
  } catch (e) {
    console.error('Chat error:', e.message);
    res.json({ reply: 'Non ho una risposta pronta. Scrivi a info@postsb.it o usa il form contatti.', fallback: true });
  }
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
