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
// NLP PREPROCESSING: STOPWORDS (Bahasa Indonesia)
// ─────────────────────────────────────────
const STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'dengan', 'untuk',
  'pada', 'adalah', 'ada', 'tidak', 'saya', 'aku', 'kamu', 'anda',
  'kita', 'kami', 'mereka', 'dia', 'ia', 'ya', 'yah', 'iya', 'ok',
  'oke', 'okey', 'juga', 'atau', 'tapi', 'tetapi', 'namun', 'jadi',
  'kalau', 'kalau', 'kalo', 'jika', 'bila', 'bahwa', 'karena', 'sebab',
  'oleh', 'akan', 'sudah', 'telah', 'belum', 'bisa', 'boleh', 'harus',
  'perlu', 'dong', 'deh', 'sih', 'nih', 'tuh', 'lah', 'kah', 'pun',
  'lagi', 'juga', 'pula', 'baru', 'masih', 'sudah', 'lebih', 'sangat',
  'sekali', 'banget', 'agak', 'sama', 'sekarang', 'nanti', 'tadi',
  'kemarin', 'besok', 'begitu', 'begini', 'seperti', 'setelah', 'sebelum',
  'ketika', 'waktu', 'saat', 'cara', 'hal', 'banyak', 'sedikit',
  'semua', 'setiap', 'masing', 'lain', 'tersebut', 'merupakan', 'buat',
  'bikin', 'gimana', 'bagaimana', 'kenapa', 'mengapa', 'siapa', 'mana',
  'dimana', 'kapan', 'berapa', 'apakah', 'apa', 'gak', 'ga', 'nggak',
  'ndak', 'tak', 'ngga', 'enggak', 'biar', 'supaya', 'agar', 'wah',
  'yuk', 'ayo', 'mari', 'coba', 'tolong', 'mohon', 'silakan', 'please',
  'thanks', 'makasih', 'terima', 'kasih', 'hehe', 'haha', 'wkwk',
]);

// ─────────────────────────────────────────
// NLP PREPROCESSING: STEMMER (Bahasa Indonesia — Nazief-Adriani simplified)
// ─────────────────────────────────────────
class IndonesianStemmer {
  constructor() {
    // Prefiks yang umum
    this.prefixes = [
      { pattern: /^me(ng|ny|n|m)?/, replacement: '' },
      { pattern: /^ber/, replacement: '' },
      { pattern: /^ter/, replacement: '' },
      { pattern: /^pe(ng|ny|n|m|r)?/, replacement: '' },
      { pattern: /^di/, replacement: '' },
      { pattern: /^ke/, replacement: '' },
      { pattern: /^se/, replacement: '' },
      { pattern: /^meng/, replacement: '' },
      { pattern: /^mem/, replacement: '' },
      { pattern: /^men/, replacement: '' },
      { pattern: /^meny/, replacement: '' },
      { pattern: /^peng/, replacement: '' },
      { pattern: /^pem/, replacement: '' },
      { pattern: /^pen/, replacement: '' },
    ];
    // Sufiks yang umum
    this.suffixes = [
      /kan$/, /an$/, /i$/, /lah$/, /kah$/, /nya$/, /ku$/, /mu$/,
    ];
    // Konfiks
    this.confixes = [
      { prefix: /^me/, suffix: /kan$/ },
      { prefix: /^me/, suffix: /i$/ },
      { prefix: /^di/, suffix: /kan$/ },
      { prefix: /^di/, suffix: /i$/ },
      { prefix: /^ke/, suffix: /an$/ },
      { prefix: /^pe(r|ng|ny|n|m)?/, suffix: /an$/ },
      { prefix: /^ber/, suffix: /an$/ },
      { prefix: /^ber/, suffix: /kan$/ },
      { prefix: /^ter/, suffix: /kan$/ },
    ];
    // Kamus kata dasar untuk validasi
    this.baseWords = new Set([
      'pesan', 'beli', 'bayar', 'lihat', 'tampil', 'harga', 'menu', 'produk',
      'tambah', 'hapus', 'batal', 'lanjut', 'pilih', 'hubung', 'tanya', 'bantu',
      'mulai', 'selesai', 'kirim', 'terima', 'minta', 'cek', 'konfirmasi',
      'order', 'keranjang', 'checkout', 'bayar', 'transfer', 'ambil',
      'datang', 'antar', 'tunggu', 'proses', 'selesai', 'jual', 'beli',
    ]);
  }

  stem(word) {
    if (word.length <= 3) return word;

    // Cek kata dasar langsung
    if (this.baseWords.has(word)) return word;

    let stemmed = word;

    // Coba hapus konfiks dulu
    for (const { prefix, suffix } of this.confixes) {
      if (prefix.test(stemmed) && suffix.test(stemmed)) {
        const candidate = stemmed.replace(prefix, '').replace(suffix, '');
        if (candidate.length >= 3) { stemmed = candidate; break; }
      }
    }

    // Coba hapus sufiks
    for (const suffix of this.suffixes) {
      if (suffix.test(stemmed)) {
        const candidate = stemmed.replace(suffix, '');
        if (candidate.length >= 3) { stemmed = candidate; break; }
      }
    }

    // Coba hapus prefiks
    for (const { pattern, replacement } of this.prefixes) {
      if (pattern.test(stemmed)) {
        const candidate = stemmed.replace(pattern, replacement);
        if (candidate.length >= 3) { stemmed = candidate; break; }
      }
    }

    return stemmed;
  }
}

// ─────────────────────────────────────────
// NLP: TRAINING DATA — DATASET DIPERLUAS
// ─────────────────────────────────────────
const TRAINING_DATA = {
  greeting: [
    'halo', 'hai', 'hi', 'hei', 'hey',
    'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam',
    'mulai', 'start', 'alo', 'permisi', 'assalamualaikum', 'waalaikumsalam',
    'hallo', 'mau tanya', 'ada yang bisa bantu', 'p',
    'selamat datang', 'hola', 'good morning', 'good night',
    'bisa dibantu', 'ada orang', 'halo masih aktif', 'bot aktif',
    'coba chat', 'tes', 'test', 'hello bot', 'hai bot',
    'halo warung', 'hei ada',
  ],
  show_menu: [
    'menu', 'lihat menu', 'daftar menu', 'ada apa aja', 'jual apa',
    'produk', 'mau lihat menu', 'tampilkan menu', 'apa yang dijual',
    'harga', 'daftar harga', 'ada menu apa', 'jualnya apa aja', 'list menu',
    'apa menunya', 'menu apa saja', 'info menu', 'katalog', 'lihat produk',
    'produk apa saja', 'makanan apa', 'ada jual apa', 'menunya dong',
    'mau liat menu', 'tunjukkan menu', 'menu ada apa', 'harga berapa',
    'harganya berapa', 'list harga', 'info harga', 'berapa harganya',
    'jenis pisang', 'varian apa saja', 'ada varian apa',
    'mau tahu harga', 'mau tau menu', 'liat katalog',
    'menu pisang', 'menu tersedia', 'pilihan menu',
  ],
  order: [
    'pesan', 'order', 'beli', 'mau pesan', 'mau beli', 'mau order',
    'pesen dong', 'pengen beli', 'mau pesen', 'bisa pesan', 'mau ambil',
    'mau pesen dong', 'boleh pesan', 'mau ngeorder', 'cobain',
    'mau cobain', 'ingin pesan', 'ingin beli', 'mau nyoba',
    'mau mesen', 'mesen dong', 'pengen pesen', 'kepingin beli',
    'mau beli pisang', 'beli pisang', 'pesan pisang', 'minta pisang',
    'mau jasuke', 'pesan jasuke', 'beli jasuke',
    'mau 1', 'mau 2', 'mau 3', 'ambil 1 porsi', 'beli 2 porsi',
    'mau satu', 'pesan dua', 'minta tiga', 'pesan satu porsi',
    'mau nambah pesanan', 'mau order sekarang', 'langsung pesan',
    'mau beli sekarang', 'pesan sekarang dong',
  ],
  add_cart: [
    'tambah', 'tambah lagi', 'mau tambah', 'pesan lagi', 'add', 'plus',
    'mau tambah item', 'order lagi', 'beli lagi', 'tambahin',
    'mau nambah', 'nambah dong', 'tambahkan', 'tambahin lagi',
    'pesan lagi dong', 'mau beli lagi', 'ada yang lain', 'item lain',
    'produk lain', 'pilih lagi', 'tambah menu lain', 'mau tambah pesanan',
    'tambah satu lagi', 'tambahin satu', 'add to cart', 'nambah pesanan',
  ],
  view_cart: [
    'keranjang', 'lihat keranjang', 'pesanan saya', 'apa yang sudah dipesan',
    'cek pesanan', 'pesanan ku', 'cart', 'recap', 'ringkasan',
    'udah pesen apa aja', 'pesanan gue',
    'cek cart', 'lihat cart', 'isi keranjang', 'sudah pesan apa',
    'total belanja', 'pesananku apa', 'rekap pesanan', 'summary pesanan',
    'list pesanan', 'daftar pesanan', 'pesanan sejauh ini',
    'sudah ada apa aja', 'apa saja yang dipesan', 'pesanan sementara',
    'mau cek pesanan', 'lihat pesanan', 'review pesanan', 'pesanan saat ini',
  ],
  checkout: [
    'bayar', 'checkout', 'lanjut bayar', 'mau bayar', 'proses pembayaran',
    'bayar sekarang', 'konfirmasi', 'selesai pesan', 'mau checkout',
    'lanjutkan pembayaran', 'pay', 'proses',
    'mau bayar sekarang', 'lanjut ke pembayaran', 'selesai deh',
    'sudah selesai pilih', 'mau langsung bayar', 'langsung bayar',
    'finalisasi', 'pesan sekarang bayar', 'konfirmasi pesanan',
    'mau konfirmasi', 'lanjut transaksi', 'beres pesan', 'udah fix',
    'fix pesanannya', 'oke bayar', 'siap bayar', 'mau transfer',
    'mau cod', 'bayar lewat dana', 'bayar lewat ovo', 'bayar lewat bri',
    'mau pilih pembayaran', 'pilih cara bayar',
  ],
  contact_cs: [
    'cs', 'customer service', 'hubungi cs', 'manusia', 'admin', 'bantuan',
    'minta tolong', 'komplain', 'ada masalah', 'bisa bicara manusia',
    'sambungkan ke cs', 'operator', 'agen', 'chat admin',
    'mau ngobrol sama manusia', 'butuh bantuan', 'ada kendala',
    'masalah pembayaran', 'ada pertanyaan', 'minta info lebih',
    'hubungi admin', 'kontak penjual', 'kontak seller', 'chat penjual',
    'ada keluhan', 'laporan masalah', 'error', 'ga bisa bayar',
    'tidak bisa order', 'nomor whatsapp admin', 'hubungi langsung',
    'mau tanya ke orang', 'butuh bantuan manusia',
  ],
  cancel: [
    'batal', 'cancel', 'gak jadi', 'tidak jadi', 'hapus pesanan',
    'batalkan', 'reset', 'ulang', 'mulai ulang', 'ga jadi',
    'hapus cart', 'kosongkan keranjang', 'mulai dari awal',
    'mau reset', 'batal semua', 'batalkan semua', 'hapus semua',
    'start over', 'dari awal lagi', 'mau mulai ulang',
    'batal pesan', 'tidak jadi pesan', 'ga jadi beli',
    'gak jadi beli', 'urungkan pesanan', 'pesanannya dibatalkan',
    'mau hapus pesanan', 'hilangkan pesanan', 'pesanan salah',
    'mau ganti pesanan', 'ulangi dari awal',
  ],
};

// ─────────────────────────────────────────
// NLP ENGINE: TF-IDF + Naive Bayes + Stemming + Stopword Removal
// ─────────────────────────────────────────
class NLPEngine {
  constructor() {
    this.stemmer = new IndonesianStemmer();
    this.vocab = new Set();
    this.idf = {};
    this.classProb = {};
    this.wordClassProb = {};
    this.tfidfVectors = {};
    this.train(TRAINING_DATA);
  }

  /**
   * PREPROCESSING PIPELINE:
   * 1. Lowercase
   * 2. Hapus tanda baca & angka
   * 3. Tokenisasi
   * 4. Stopword removal
   * 5. Stemming (Nazief-Adriani simplified)
   */
  tokenize(text) {
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\d+/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);

    // Stopword removal + stemming
    return tokens
      .filter(t => !STOPWORDS.has(t))
      .map(t => this.stemmer.stem(t));
  }

  // Hitung TF (Term Frequency) dari token list
  tf(tokens) {
    const freq = {};
    tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
    const total = tokens.length;
    if (total === 0) return freq;
    Object.keys(freq).forEach(t => { freq[t] /= total; });
    return freq;
  }

  train(data) {
    const allDocs = [];
    const classDocs = {};

    Object.entries(data).forEach(([intent, sentences]) => {
      classDocs[intent] = sentences.map(s => this.tokenize(s));
      classDocs[intent].forEach(tokens => {
        allDocs.push({ intent, tokens });
        tokens.forEach(t => this.vocab.add(t));
      });
    });

    const N = allDocs.length;
    const vocabArr = [...this.vocab];

    // Hitung IDF (Inverse Document Frequency)
    vocabArr.forEach(word => {
      const docsWithWord = allDocs.filter(d => d.tokens.includes(word)).length;
      // Smooth IDF: log((N+1)/(df+1)) + 1
      this.idf[word] = Math.log((N + 1) / (docsWithWord + 1)) + 1;
    });

    // Hitung class probability dan P(word|class) untuk Naive Bayes
    Object.entries(classDocs).forEach(([intent, docs]) => {
      this.classProb[intent] = Math.log(docs.length / N);

      const allTokens = docs.flat();
      const freq = {};
      allTokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
      // Laplace smoothing: +1 di numerator, +|V| di denominator
      const total = allTokens.length + vocabArr.length;

      this.wordClassProb[intent] = {};
      vocabArr.forEach(word => {
        this.wordClassProb[intent][word] = Math.log(((freq[word] || 0) + 1) / total);
      });

      // TF-IDF vector per class (rata-rata semua dokumen dalam class)
      const tfidfSum = {};
      docs.forEach(tokens => {
        const tfScore = this.tf(tokens);
        tokens.forEach(t => {
          tfidfSum[t] = (tfidfSum[t] || 0) + (tfScore[t] * (this.idf[t] || 1));
        });
      });
      // Normalisasi dengan jumlah dokumen dalam class
      Object.keys(tfidfSum).forEach(t => {
        tfidfSum[t] /= docs.length;
      });
      this.tfidfVectors[intent] = tfidfSum;
    });
  }

  // Cosine Similarity antara dua vektor (representasi sebagai object)
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

  /**
   * KLASIFIKASI: Hybrid TF-IDF Cosine Similarity + Multinomial Naive Bayes
   *
   * Formula akhir:
   *   score(c) = α × P_NB(c|d) + (1-α) × CosineSim(tfidf_d, tfidf_c)
   *   α = 0.6 (bobot Naive Bayes), 1-α = 0.4 (bobot TF-IDF Cosine)
   *
   * Confidence threshold = 0.15 (tolak jika terlalu rendah)
   */
  classify(text) {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) return { intent: 'unknown', confidence: 0 };

    // Buat TF-IDF vector untuk input query
    const tfScore = this.tf(tokens);
    const inputVec = {};
    tokens.forEach(t => {
      inputVec[t] = tfScore[t] * (this.idf[t] || 0.5); // OOV (out-of-vocab) = 0.5
    });

    const scores = {};
    Object.keys(this.classProb).forEach(intent => {
      // Skor Multinomial Naive Bayes (log-space)
      let nbScore = this.classProb[intent];
      tokens.forEach(t => {
        if (this.wordClassProb[intent][t] !== undefined) {
          nbScore += this.wordClassProb[intent][t];
        } else {
          // Smoothing untuk OOV words: gunakan probabilitas minimum dari vocab
          nbScore += Math.log(1 / (Object.keys(this.wordClassProb[intent]).length + this.vocab.size));
        }
      });

      // Skor TF-IDF Cosine Similarity
      const cosScore = this.cosineSim(inputVec, this.tfidfVectors[intent]);

      scores[intent] = { nb: nbScore, cos: cosScore };
    });

    // Normalisasi NB dari log-space ke probabilitas (softmax)
    const nbMax = Math.max(...Object.values(scores).map(s => s.nb));
    let nbSum = 0;
    Object.values(scores).forEach(s => {
      s.nbNorm = Math.exp(s.nb - nbMax); // numerically stable softmax
      nbSum += s.nbNorm;
    });
    Object.values(scores).forEach(s => { s.nbNorm /= nbSum; });

    // Hybrid score: 60% NB + 40% TF-IDF Cosine
    const hybrid = {};
    Object.entries(scores).forEach(([intent, s]) => {
      hybrid[intent] = 0.6 * s.nbNorm + 0.4 * s.cos;
    });

    const sorted = Object.entries(hybrid).sort((a, b) => b[1] - a[1]);
    const [bestIntent, bestScore] = sorted[0];

    // Confidence threshold: jika terlalu rendah, kembalikan unknown
    const CONFIDENCE_THRESHOLD = 0.15;
    if (bestScore < CONFIDENCE_THRESHOLD) {
      return { intent: 'unknown', confidence: bestScore };
    }

    return { intent: bestIntent, confidence: bestScore };
  }

  // Ekstrak angka dari teks (kata atau digit)
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

  /**
   * Deteksi item menu yang disebut dalam teks.
   * Prioritas:
   * 1. Nama produk eksplisit (minimal 2 kata cocok)
   * 2. Shorthand/keyword varian
   * 3. Nomor menu (fallback terakhir)
   */
  detectMenuItem(text) {
    const lower = text.toLowerCase();

    // 1. Nama produk eksplisit
    for (const item of MENU) {
      const keywords = item.name.toLowerCase().split(' ');
      const matchCount = keywords.filter(k => lower.includes(k)).length;
      if (matchCount >= 2) return item;
    }

    // 2. Shorthand keyword
    if (lower.includes('jasuke') || lower.includes('jagung')) return MENU[5];
    if (lower.includes('tiramisu'))                             return MENU[4];
    if (lower.includes('matcha'))                               return MENU[2];
    if (lower.includes('coklat') || lower.includes('choco'))   return MENU[3];
    if (lower.includes('mix'))                                  return MENU[1];
    if (lower.includes('original') || lower.includes('ori'))   return MENU[0];

    // 3. Nomor menu (fallback)
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

  // ── Konteks: menunggu jumlah porsi ──
  if (s.awaitQty) {
    const qty = nlp.extractNumber(teks);
    if (!qty || qty < 1)
      return '⚠️ Masukkan jumlah yang valid ya, minimal 1 porsi.\n\nMisal: ketik *2* atau *dua*';
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

  // ── Klasifikasi intent via NLP (TF-IDF + Naive Bayes + Stemming + Stopword) ──
  const { intent, confidence } = nlp.classify(teks);

  // Jika ada item menu yang disebut eksplisit, prioritaskan alur order
  const mentionedItem = nlp.detectMenuItem(teks);
  if (mentionedItem && (intent === 'order' || intent === 'add_cart' || intent === 'show_menu' || confidence < 0.25)) {
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
app.listen(PORT, () => console.log(`🍌 Warung HESA Chatbot running on port ${PORT}`));
