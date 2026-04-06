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

// ═══ API: CHAT (Claude) ═══
app.post('/api/chat', async (req, res) => {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Messaggio obbligatorio' });

  // Load site context for the AI
  const systemPrompt = `Sei l'assistente del sito di POST Società Benefit, una piccola società di consulenza per il welfare, le politiche pubbliche e lo sviluppo territoriale, con sede a Milano.

I QUATTRO PILASTRI di POST:
1. VALUTAZIONE D'IMPATTO — Indicatori di esito e processo, ricerca sociale, accountability. Novità 2025: Valutazione d'Impatto Generazionale (Legge 167/2025). POST ha anche Valutapp, una piattaforma per gestire l'intero processo di valutazione.
2. AMMINISTRAZIONE CONDIVISA — Coprogrammazione e coprogettazione tra PA e Terzo Settore. Facilitazione tavoli tematici, innovazione istituzionale, governance partecipata. Include il servizio dedicato Piani di Zona.
3. CONSULENZA ORGANIZZATIVA — Piani di impresa, passaggio intergenerazionale, sviluppo competenze, riorganizzazione dei processi. Per cooperative, consorzi, fondazioni, enti del Terzo Settore.
4. USO DEI DATI E INTELLIGENZA ARTIFICIALE — Programmazione data driven, analisi dati sociali, AI nei processi collaborativi. Include wAIt (Welfare & Artificial Intelligence Toolkit): formazione, sperimentazione e consulenza sull'AI per PA e Terzo Settore.

PIANI DI ZONA: POST offre assistenza tecnica per ambiti territoriali. Il percorso: 1) Valutazione e Monitoraggio, 2) Programmazione e Redazione, 3) Coprogrammazione, 4) Supporto Normativo (L.R. 3/2008, Codice Terzo Settore, DGR).

IL TEAM (tutti co-founder): Nicola Basile (fondatore, amministrazione condivisa, docente Cattolica Milano), Pierluca Borali (30+ anni consulenza organizzativa), Giuseppe Imbrogno (progettista sociale, coordina OVeR), Nicol Mondin (psicologa, welfare e comunità), Daniele Restelli (economista, gestione servizi).

CONTATTI: info@postsb.it, +39 3939993731, Milano. LinkedIn: linkedin.com/company/105770276

Rispondi in italiano, in modo conciso e diretto. Usa il tono di POST: artigianale, concreto, anti-corporate. Se non sai qualcosa, suggerisci di contattare info@postsb.it. Non inventare servizi che POST non offre. Risposte brevi (2-4 frasi massimo).`;

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
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const reply = data.content?.[0]?.text || 'Mi dispiace, non sono riuscito a generare una risposta.';
      res.json({ reply });
    } else {
      // Fallback to chatbot.json
      res.json({ reply: 'Non ho una risposta pronta. Scrivi a info@postsb.it o usa il form contatti.', fallback: true });
    }
  } catch (e) {
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
