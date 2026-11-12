// Isi LKM: aktivitas, petunjuk, dan pertanyaan.
// Dipakai bersama oleh halaman murid dan dashboard guru.

export const ACTIVITIES = [
  {
    id: 1,
    short: "Sumbu Koordinat",
    title: "Refleksi terhadap Sumbu Koordinat",
    goal: "Menemukan aturan perubahan koordinat titik dan grafik fungsi ketika dicerminkan terhadap sumbu X dan sumbu Y.",
    mirrors: [
      { type: "x-axis", label: "Cerminkan terhadap sumbu X", tag: "sb X" },
      { type: "y-axis", label: "Cerminkan terhadap sumbu Y", tag: "sb Y" },
    ],
    params: [],
    defaultA: [3, 2],
    defaultFn: "x^2 - 4x + 3",
    steps: [
      "Geser titik A pada grafik, atau ketik koordinatnya di kolom x dan y.",
      "Aktifkan <b>Cerminkan terhadap sumbu X</b>, lalu amati titik A₁′ dan grafik bayangannya.",
      "Matikan sumbu X, lalu aktifkan <b>Cerminkan terhadap sumbu Y</b>. Amati titik A₂′.",
      "Ganti bentuk fungsi dan ulangi pengamatan. Catat koordinat yang kamu lihat pada tabel di bawah grafik.",
    ],
    questions: [
      "Amati titik A sebelum dan sesudah dicerminkan terhadap sumbu X. Koordinat bagian manakah yang berubah? Bagian manakah yang tetap?",
      "Berdasarkan pengamatanmu, tuliskan hubungan koordinat titik A dengan koordinat bayangannya terhadap sumbu X.",
      "Lakukan pengamatan yang sama untuk pencerminan terhadap sumbu Y. Apa perbedaan perubahan koordinatnya?",
      "Amati grafik fungsi sebelum dan sesudah dicerminkan terhadap sumbu X. Bagaimana perubahan posisi grafik tersebut?",
      "Amati grafik fungsi sebelum dan sesudah dicerminkan terhadap sumbu Y. Bagaimana perubahan posisi grafik tersebut?",
    ],
  },
  {
    id: 2,
    short: "Garis x = h & y = k",
    title: "Refleksi terhadap Garis x = h dan y = k",
    goal: "Menyelidiki hubungan koordinat titik dan bayangannya ketika dicerminkan terhadap garis vertikal x = h dan garis horizontal y = k.",
    mirrors: [
      { type: "x=h", label: "Cerminkan terhadap garis x = h", tag: "x = h" },
      { type: "y=k", label: "Cerminkan terhadap garis y = k", tag: "y = k" },
    ],
    params: [
      { key: "h", label: "h", min: -6, max: 6, step: 0.5, value: 2, hint: "posisi garis x = h" },
      { key: "k", label: "k", min: -6, max: 6, step: 0.5, value: 1, hint: "posisi garis y = k" },
    ],
    defaultA: [-1, 3],
    defaultFn: "0.5x + 2",
    steps: [
      "Aktifkan <b>Cerminkan terhadap garis x = h</b>. Garis cermin berwarna jingga akan muncul.",
      "Ubah nilai <b>h</b> dengan slider. Perhatikan bagaimana garis cermin dan titik A₁′ ikut bergerak.",
      "Aktifkan <b>Cerminkan terhadap garis y = k</b>, lalu ubah nilai <b>k</b>. Amati titik A₂′.",
      "Geser titik A ke beberapa posisi dan bandingkan koordinatnya dengan koordinat bayangannya.",
    ],
    questions: [
      "Ubah nilai h beberapa kali. Amati posisi titik A dan bayangannya terhadap garis x = h. Bagaimana hubungan koordinat keduanya?",
      "Apakah nilai koordinat y berubah ketika titik dicerminkan terhadap garis x = h? Jelaskan berdasarkan pengamatan.",
      "Ubah nilai k beberapa kali. Amati posisi titik A dan bayangannya terhadap garis y = k. Bagaimana hubungan koordinat keduanya?",
      "Apakah nilai koordinat x berubah ketika titik dicerminkan terhadap garis y = k? Jelaskan berdasarkan pengamatan.",
      "Amati perubahan grafik fungsi pada kedua jenis pencerminan tersebut. Apa yang dapat kamu simpulkan dari pergerakan grafiknya?",
    ],
  },
  {
    id: 3,
    short: "Garis y = x & y = −x",
    title: "Refleksi terhadap Garis y = x dan y = −x",
    goal: "Menemukan pola pertukaran koordinat ketika titik dan grafik fungsi dicerminkan terhadap garis y = x dan y = −x.",
    mirrors: [
      { type: "y=x", label: "Cerminkan terhadap garis y = x", tag: "y = x" },
      { type: "y=-x", label: "Cerminkan terhadap garis y = −x", tag: "y = −x" },
    ],
    params: [],
    defaultA: [4, 1],
    defaultFn: "x^2 - 3",
    steps: [
      "Aktifkan <b>Cerminkan terhadap garis y = x</b>. Bandingkan koordinat A dan A₁′ pada tabel.",
      "Aktifkan <b>Cerminkan terhadap garis y = −x</b>. Bandingkan koordinat A dan A₂′.",
      "Coba fungsi kuadrat: perhatikan bahwa bayangannya bisa berupa kurva yang <i>bukan</i> fungsi y = g(x).",
      "Ganti bentuk fungsi (misalnya eksponen atau linear) dan amati posisi grafik bayangannya.",
    ],
    questions: [
      "Amati koordinat titik A dan bayangannya setelah dicerminkan terhadap garis y = x. Apa hubungan antara koordinat awal dan koordinat bayangannya?",
      "Bagaimana hubungan koordinat titik A dan bayangannya setelah dicerminkan terhadap garis y = −x?",
      "Bandingkan kedua hasil pencerminan tersebut. Apa perbedaan perubahan koordinatnya?",
      "Amati grafik fungsi setelah dicerminkan terhadap garis y = x. Bagaimana posisi grafik hasil pencerminan dibandingkan dengan grafik awal?",
      "Amati grafik fungsi setelah dicerminkan terhadap garis y = −x. Apa yang kamu temukan?",
    ],
  },
  {
    id: 4,
    short: "Titik Pusat",
    title: "Refleksi terhadap Titik Pusat",
    goal: "Menyelidiki hubungan titik, titik pusat, dan bayangannya ketika dicerminkan terhadap titik O(0, 0) dan titik P(a, b).",
    mirrors: [
      { type: "O", label: "Cerminkan terhadap titik O(0, 0)", tag: "O" },
      { type: "P", label: "Cerminkan terhadap titik P(a, b)", tag: "P" },
    ],
    params: [
      { key: "a", label: "a", min: -6, max: 6, step: 0.5, value: 2, hint: "absis titik P" },
      { key: "b", label: "b", min: -6, max: 6, step: 0.5, value: -1, hint: "ordinat titik P" },
    ],
    defaultA: [3, 2],
    defaultFn: "sqrt(x) + 1",
    steps: [
      "Aktifkan <b>Cerminkan terhadap titik O(0, 0)</b>. Perhatikan garis bantu yang menghubungkan A, O, dan A₁′.",
      "Aktifkan <b>Cerminkan terhadap titik P(a, b)</b>. Titik P ditandai dengan bentuk belah ketupat.",
      "Ubah nilai <b>a</b> dan <b>b</b> dengan slider (atau geser titik P langsung). Amati posisi A₂′.",
      "Ganti bentuk fungsi dan amati perubahan grafik bayangannya terhadap kedua titik pusat.",
    ],
    questions: [
      "Amati titik A dan bayangannya setelah dicerminkan terhadap titik pusat O(0,0). Bagaimana hubungan koordinat keduanya?",
      "Apa hubungan antara titik A, titik pusat O(0,0), dan bayangannya?",
      "Ubah nilai a dan b pada titik pusat P(a,b). Amati perubahan posisi bayangan titik A.",
      "Bagaimana hubungan koordinat titik A dengan koordinat bayangannya jika dicerminkan terhadap titik pusat P(a,b)?",
      "Amati perubahan grafik fungsi setelah dicerminkan terhadap kedua titik pusat tersebut. Apa yang dapat kamu temukan?",
    ],
  },
];

export const answerKey = (act, q) => `a${act}q${q}`;
export const TOTAL_QUESTIONS = ACTIVITIES.reduce((n, a) => n + a.questions.length, 0);

export const FUNCTION_PRESETS = [
  { label: "Linear", expr: "0.5x + 2" },
  { label: "Kuadrat", expr: "x^2 - 4x + 3" },
  { label: "Kuadrat sederhana", expr: "x^2 - 3" },
  { label: "Kubik", expr: "0.25x^3 - x" },
  { label: "Kubik bergeser", expr: "0.2x^3 - x + 2" },
  { label: "Akar", expr: "sqrt(x) + 1" },
  { label: "Eksponen", expr: "2^x" },
  { label: "Sinus", expr: "2sin(x)" },
  { label: "Nilai mutlak", expr: "abs(x - 1) - 2" },
];
