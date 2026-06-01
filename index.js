const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const FONNTE_TOKEN = 'zep5Y9eJYNRY8mYrTCEy';

// ─────────────────────────────────────────
// MENU
// ─────────────────────────────────────────
const MENU = [
  { id: 1, name: 'Pisang Pasir Original',       price: 8000  },
  { id: 2, name: 'Pisang Pasir Mix Rasa',        price: 10000 },
  { id: 3, name: 'Pisang Pasir Varian Matcha',   price: 9000  },
  { id: 4, name: 'Pisang Pasir Varian Coklat',   price: 9000  },
  { id: 5, name: 'Pisang Pasir Varian Tiramisu', price: 9000  },
  { id: 6, name: 'Jasuke',                       price: 5000  },
];

// ─────────────────────────────────────────
// NLP: TRAINING DATA (intent → contoh kalimat)
// ─────────────────────────────────────────
const TRAINING_DATA = {
  greeting: [
    'halo', 'hai', 'hi', 'hei', 'selamat pagi', 'selamat siang', 'selamat malam',
    'mulai', 'start', 'alo', 'permisi', 'assalamualaikum', 'p', 'hallo',
    'hey', 'mau tanya', 'ada yang bisa bantu',
  ],
  show_menu: [
    'menu', 'lihat menu', 'daftar menu', 'ada apa aja', 'jual apa', 'produk',
    'mau lihat menu', 'tampilkan menu', 'apa yang dijual', 'harga', 'daftar harga',
    'ada menu apa', 'jualnya apa aja', 'list menu',
  ],
  order: [
    'pesan', 'order', 'beli', 'mau pesan', 'mau beli', 'mau order',
    'pesen dong', 'pengen beli', 'mau pesen', 'bisa pesan', 'mau ambil',
    'mau pesen dong', 'boleh pesan', 'mau ngeorder', 'cobain',
  ],
  add_cart: [
    'tambah', 'tambah lagi', 'mau tambah', 'pesan lagi', 'add', 'plus',
    'mau tambah item', 'order lagi', 'beli lagi', 'tambahin',
  ],
  view_cart: [
    'keranjang', 'lihat keranjang', 'pesanan saya', 'apa yang sudah dipesan',
    'cek pesanan', 'pesanan ku', 'cart', 'recap', 'ringkasan',
    'udah pesen apa aja', 'pesanan gue',
  ],
  checkout: [
    'bayar', 'checkout', 'lanjut bayar', 'mau bayar', 'proses pembayaran',
    'bayar sekarang', 'konfirmasi', 'selesai pesan', 'mau checkout',
    'lanjutkan pembayaran', 'pay', 'proses',
  ],
  contact_cs: [
    'cs', 'customer service', 'hubungi cs', 'manusia', 'admin', 'bantuan',
    'minta tolong', 'komplain', 'ada masalah', 'bisa bicara manusia',
    'sambungkan ke cs', 'operator', 'agen', 'chat admin',
  ],
  cancel: [
    'batal', 'cancel', 'gak jadi', 'tidak jadi', 'hapus pesanan',
    'batalkan', 'reset', 'ulang', 'mulai ulang', 'ga jadi',
  ],
};

// ─────────────────────────────────────────
// NLP ENGINE: TF-IDF + Naive Bayes Hybrid
// ─────────────────────────────────────────
class NLPEngine {
  constructor() {
    this.vocab = new Set();
    this.idf = {};
    this.classProb = {};    // P(class)
    this.wordClassProb = {}; // P(word|class) untuk Naive Bayes
    this.tfidfVectors = {}; // TF-IDF vector per class
    this.train(TRAINING_DATA);
  }

  // Tokenizer: lowercase, hapus tanda baca, split kata
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  // Hitung TF dari token list
  tf(tokens) {
    const freq = {};
    tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
    const total = tokens.length;
    Object.keys(freq).forEach(t => { freq[t] /= total; });
    return freq;
  }

  train(data) {
    const allDocs = [];
    const classDocs = {};

    // Kumpulkan semua dokumen per class
    Object.entries(data).forEach(([intent, sentences]) => {
      classDocs[intent] = sentences.map(s => this.tokenize(s));
      classDocs[intent].forEach(tokens => {
        allDocs.push({ intent, tokens });
        tokens.forEach(t => this.vocab.add(t));
      });
    });

    const N = allDocs.length;
    const vocabArr = [...this.vocab];

    // Hitung IDF
    vocabArr.forEach(word => {
      const docsWithWord = allDocs.filter(d => d.tokens.includes(word)).length;
      this.idf[word] = Math.log((N + 1) / (docsWithWord + 1)) + 1;
    });

    // Hitung P(class) dan P(word|class) untuk Naive Bayes
    Object.entries(classDocs).forEach(([intent, docs]) => {
      this.classProb[intent] = Math.log(docs.length / N);

      // Gabungkan semua token dari class ini
      const allTokens = docs.flat();
      const freq = {};
      allTokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
      const total = allTokens.length + vocabArr.length; // Laplace smoothing

      this.wordClassProb[intent] = {};
      vocabArr.forEach(word => {
        this.wordClassProb[intent][word] = Math.log(((freq[word] || 0) + 1) / total);
      });

      // Buat TF-IDF vector per class (rata-rata semua dokumen)
      const tfidfSum = {};
      docs.forEach(tokens => {
        const tfScore = this.tf(tokens);
        tokens.forEach(t => {
          tfidfSum[t] = (tfidfSum[t] || 0) + (tfScore[t] * (this.idf[t] || 1));
        });
      });
      this.tfidfVectors[intent] = tfidfSum;
    });
  }

  // Cosine similarity antara dua vektor (object)
  cosineSim(vecA, vecB) {
    const keysA = Object.keys(vecA);
    let dot = 0, magA = 0, magB = 0;
    keysA.forEach(k => {
      dot += (vecA[k] || 0) * (vecB[k] || 0);
      magA += vecA[k] ** 2;
    });
    Object.values(vecB).forEach(v => { magB += v ** 2; });
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  // Klasifikasi: hybrid TF-IDF cosine + Naive Bayes
  classify(text) {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) return { intent: 'unknown', confidence: 0 };

    const tfScore = this.tf(tokens);
    const inputVec = {};
    tokens.forEach(t => {
      inputVec[t] = tfScore[t] * (this.idf[t] || 1);
    });

    const scores = {};
    Object.keys(this.classProb).forEach(intent => {
      // Skor Naive Bayes
      let nbScore = this.classProb[intent];
      tokens.forEach(t => {
        if (this.wordClassProb[intent][t] !== undefined) {
          nbScore += this.wordClassProb[intent][t];
        }
      });

      // Skor TF-IDF cosine
      const cosScore = this.cosineSim(inputVec, this.tfidfVectors[intent]);

      // Hybrid: normalisasi NB (exp) lalu gabung dengan cosine
      scores[intent] = { nb: nbScore, cos: cosScore };
    });

    // Normalisasi NB ke probabilitas
    const nbMax = Math.max(...Object.values(scores).map(s => s.nb));
    let nbSum = 0;
    Object.values(scores).forEach(s => { s.nbNorm = Math.exp(s.nb - nbMax); nbSum += s.nbNorm; });
    Object.values(scores).forEach(s => { s.nbNorm /= nbSum; });

    // Hybrid score: 60% NB + 40% cosine
    const hybrid = {};
    Object.entries(scores).forEach(([intent, s]) => {
      hybrid[intent] = 0.6 * s.nbNorm + 0.4 * s.cos;
    });

    const best = Object.entries(hybrid).sort((a, b) => b[1] - a[1])[0];
    return { intent: best[0], confidence: best[1] };
  }

  // Ekstrak angka dari teks
  extractNumber(text) {
    const words = {
      'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4, 'lima': 5,
      'enam': 6, 'tujuh': 7, 'delapan': 8, 'sembilan': 9, 'sepuluh': 10,
    };
    for (const [word, num] of Object.entries(words)) {
      if (text.toLowerCase().includes(word)) return num;
    }
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  // Deteksi menu yang disebut dalam teks
  // Prioritas: nama produk eksplisit > shorthand > nomor menu
  detectMenuItem(text) {
    const lower = text.toLowerCase();

    // 1. Cek nama produk (minimal 2 kata cocok)
    for (const item of MENU) {
      const keywords = item.name.toLowerCase().split(' ');
      const matchCount = keywords.filter(k => lower.includes(k)).length;
      if (matchCount >= 2) return item;
    }

    // 2. Shorthand keyword
    if (lower.includes('jasuke') || lower.includes('jagung')) return MENU[5];
    if (lower.includes('tiramisu')) return MENU[4];
    if (lower.includes('matcha')) return MENU[2];
    if (lower.includes('coklat') || lower.includes('choco')) return MENU[3];
    if (lower.includes('mix')) return MENU[1];
    if (lower.includes('original')) return MENU[0];

    // 3. Nomor menu (hanya fallback terakhir)
    const numStr = text.match(/\b[1-6]\b/);
    if (numStr) return MENU[parseInt(numStr[0]) - 1];

    return null;
  }
}

const nlp = new NLPEngine();

// ─────────────────────────────────────────
// SESSION & HELPER
// ─────────────────────────────────────────
const sessions = {};

function getSession(nomor) {
  if (!sessions[nomor]) {
    sessions[nomor] = { step: 'init', cart: [], awaitQty: null };
  }
  return sessions[nomor];
}

function fmt(n) { return 'Rp ' + n.toLocaleString('id-ID'); }

function buildMenuText() {
  let t = '🍌 *Menu Warung HESA* 🍌\n\n';
  MENU.forEach((m, i) => { t += `${i + 1}. ${m.name} — ${fmt(m.price)}\n`; });
  t += '\nSebutkan nama atau nomor menu yang kamu mau! 😊';
  return t;
}

function buildSummary(cart) {
  let text = '🛒 *Ringkasan Pesanan:*\n';
  let total = 0;
  cart.forEach(c => {
    const sub = c.price * c.qty;
    total += sub;
    text += `• ${c.name} x${c.qty} = ${fmt(sub)}\n`;
  });
  text += `\n*Total: ${fmt(total)}*`;
  return text;
}

async function kirimPesan(nomor, pesan) {
  await axios.post('https://api.fonnte.com/send', {
    target: nomor,
    message: pesan,
  }, { headers: { Authorization: FONNTE_TOKEN } });
}

// ─────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────
function handleMessage(nomor, teks) {
  const s = getSession(nomor);
  const lower = teks.toLowerCase().trim();

  // ── Konteks: menunggu jumlah porsi ──
  if (s.awaitQty) {
    const qty = nlp.extractNumber(teks);
    if (!qty || qty < 1) return '⚠️ Masukkan jumlah yang valid ya, minimal 1 porsi.\n\nMisal: ketik *2* atau *dua*';
    const item = MENU.find(m => m.id === s.awaitQty);
    const exist = s.cart.find(c => c.id === item.id);
    if (exist) exist.qty += qty; else s.cart.push({ ...item, qty });
    s.awaitQty = null;
    return `✅ *${item.name}* x${qty} ditambahkan ke keranjang!\n\nMau:\n• *tambah* — pesan produk lain\n• *keranjang* — lihat pesanan\n• *bayar* — lanjut pembayaran`;
  }

  // ── Konteks: pilih metode bayar ──
  if (s.step === 'payment') {
    const num = nlp.extractNumber(teks);
    const methods = {
      1: { label: 'Transfer BRI', info: 'Bank BRI\nNo. Rek: 1234567890 a.n. Warung HESA' },
      2: { label: 'Transfer BCA', info: 'Bank BCA\nNo. Rek: 0987654321 a.n. Warung HESA' },
      3: { label: 'Dana',         info: 'Dana: 0812-3456-7890 a.n. Warung HESA' },
      4: { label: 'OVO',          info: 'OVO: 0812-3456-7890 a.n. Warung HESA' },
      5: { label: 'Tunai/COD',    info: 'Pembayaran tunai saat pesanan tiba' },
    };
    if (num && methods[num]) {
      const chosen = methods[num];
      s.cart = []; s.step = 'done';
      return `✅ *Metode: ${chosen.label}*\n\n💳 *Info Pembayaran:*\n${chosen.info}\n\nSetelah bayar, kirim bukti ke CS kami 📸\n\nTerima kasih sudah memesan di Warung HESA! 🍌`;
    }
    return '⚠️ Pilih angka 1–5 ya untuk metode pembayaran.';
  }

  // ── Klasifikasi intent via NLP ──
  const { intent, confidence } = nlp.classify(teks);

  // Jika ada item menu yang disebut, langsung proses order
  const mentionedItem = nlp.detectMenuItem(teks);
  if (mentionedItem && (intent === 'order' || intent === 'show_menu' || confidence < 0.3)) {
    const qty = nlp.extractNumber(teks);
    if (qty) {
      const exist = s.cart.find(c => c.id === mentionedItem.id);
      if (exist) exist.qty += qty; else s.cart.push({ ...mentionedItem, qty });
      return `✅ *${mentionedItem.name}* x${qty} ditambahkan!\n\nMau:\n• *tambah* — pesan lagi\n• *keranjang* — lihat pesanan\n• *bayar* — lanjut bayar`;
    } else {
      s.awaitQty = mentionedItem.id;
      return `Kamu pilih: *${mentionedItem.name}*\nHarga: ${fmt(mentionedItem.price)}/porsi\n\nMau pesan berapa porsi?`;
    }
  }

  // ── Handle per intent ──
  switch (intent) {
    case 'greeting':
      s.step = 'main';
      return `Halo! Selamat datang di *Warung HESA* 🍌\n_Hemat, Enak, dan Selalu Ada!_\n\nKetik:\n• *menu* — lihat produk & harga\n• *pesan* — langsung pesan\n• *cs* — hubungi admin`;

    case 'show_menu':
      s.step = 'menu';
      return buildMenuText();

    case 'order':
      s.step = 'menu';
      return buildMenuText();

    case 'add_cart':
      s.step = 'menu';
      return buildMenuText();

    case 'view_cart':
      if (!s.cart.length) return '🛒 Keranjangmu masih kosong.\n\nKetik *menu* untuk lihat produk ya!';
      return buildSummary(s.cart) + '\n\nKetik *bayar* untuk lanjut atau *tambah* untuk tambah produk.';

    case 'checkout':
      if (!s.cart.length) return '⚠️ Keranjangmu kosong dulu nih!\n\nKetik *menu* untuk mulai pesan.';
      s.step = 'payment';
      return buildSummary(s.cart) + '\n\n💳 *Pilih metode pembayaran:*\n1. Transfer BRI\n2. Transfer BCA\n3. Dana\n4. OVO\n5. Tunai/COD';

    case 'contact_cs':
      return '👋 *Hubungi CS Warung HESA*\n\nSilakan chat langsung:\n📱 *wa.me/6285830307719*\n\nJam operasional:\n🕗 08.00 – 21.00 WIB\n\nKetik *menu* untuk kembali ke chatbot.';

    case 'cancel':
      s.cart = [];
      s.step = 'init';
      s.awaitQty = null;
      return '🔄 Pesanan dibatalkan dan sesi direset.\n\nKetik *halo* untuk mulai lagi ya!';

    default:
      return '❓ Maaf, aku kurang ngerti maksudnya.\n\nCoba ketik:\n• *menu* — lihat produk\n• *pesan* — mulai pesan\n• *cs* — hubungi admin';
  }
}

// ─────────────────────────────────────────
// WEBHOOK
// ─────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  const { sender, message } = req.body;
  if (!sender || !message) return res.sendStatus(200);
  try {
    const balasan = handleMessage(sender, message);
    await kirimPesan(sender, balasan);
  } catch (err) {
    console.error('Error:', err.message);
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
