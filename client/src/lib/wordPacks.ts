export type WordPackCategory = 'coding' | 'science' | 'literature' | 'pop_culture' | 'languages' | 'general';
export type WordPackDifficulty = 'beginner' | 'intermediate' | 'expert';

export interface WordPack {
  id: string;
  title: string;
  description: string;
  category: WordPackCategory;
  icon: string;
  color: string;
  difficulty: WordPackDifficulty;
  words: string[];
  tags: string[];
  author: string;
  authorId?: string;
  isOfficial: boolean;
  likesCount: number;
  playsCount: number;
  createdAt: string;
}

export const WORD_PACK_CATEGORIES: { id: WordPackCategory; name: string; icon: string }[] = [
  { id: 'coding', name: 'Coding & Tech', icon: '💻' },
  { id: 'science', name: 'Science & Medicine', icon: '🧬' },
  { id: 'literature', name: 'Vocabulary & Lexicon', icon: '📚' },
  { id: 'pop_culture', name: 'Gaming & Sci-Fi', icon: '🌌' },
  { id: 'languages', name: 'Anime & Languages', icon: '🌸' },
  { id: 'general', name: 'General & Trivia', icon: '🌐' }
];

export const OFFICIAL_WORD_PACKS: WordPack[] = [
  {
    id: 'pack_web_dev',
    title: '💻 Full-Stack Web Dev',
    description: 'Modern JavaScript, TypeScript, React hooks, and backend architecture syntax.',
    category: 'coding',
    icon: '💻',
    color: '#38bdf8',
    difficulty: 'intermediate',
    tags: ['javascript', 'typescript', 'react', 'node', 'webdev', 'frontend'],
    author: 'TypeClash Official',
    isOfficial: true,
    likesCount: 342,
    playsCount: 1850,
    createdAt: '2026-08-01',
    words: [
      'async', 'await', 'promise', 'callback', 'closure', 'middleware', 'typescript', 'interface',
      'component', 'useEffect', 'useState', 'useMemo', 'useCallback', 'prototype', 'hydration',
      'tailwind', 'graphql', 'websocket', 'postgres', 'debounce', 'throttle', 'immutable', 'polymorphic',
      'observable', 'reducer', 'singleton', 'dependency', 'refactor', 'monorepo', 'webpack', 'turbopack',
      'prerender', 'endpoint', 'authorization', 'cryptography', 'sanitization', 'concurrency', 'deadlock'
    ]
  },
  {
    id: 'pack_python_algo',
    title: '🐍 Python & Algorithms',
    description: 'Data structures, computer science algorithms, and quintessential Python concepts.',
    category: 'coding',
    icon: '🐍',
    color: '#10b981',
    difficulty: 'intermediate',
    tags: ['python', 'algorithms', 'data-structures', 'cs', 'backend'],
    author: 'TypeClash Official',
    isOfficial: true,
    likesCount: 289,
    playsCount: 1420,
    createdAt: '2026-08-03',
    words: [
      'generator', 'decorator', 'comprehension', 'recursion', 'backtracking', 'memoization',
      'quicksort', 'mergesort', 'binarysearch', 'polymorphism', 'inheritance', 'concurrency',
      'multithreading', 'dunder', 'dataclass', 'lambda', 'hashmap', 'adjacency', 'dijkstra',
      'dynamicprogramming', 'asymptotic', 'logarithmic', 'pseudocode', 'bitmask', 'topological',
      'traversal', 'depthfirst', 'breadthfirst', 'fibonacci', 'heuristic', 'monotonic', 'palindrome'
    ]
  },
  {
    id: 'pack_medical_anatomy',
    title: '🧬 Medical & Neuroanatomy',
    description: 'High-yield terminology from human anatomy, neurobiology, and clinical medicine.',
    category: 'science',
    icon: '🧬',
    color: '#ec4899',
    difficulty: 'expert',
    tags: ['medical', 'anatomy', 'neuroscience', 'biology', 'science'],
    author: 'TypeClash Official',
    isOfficial: true,
    likesCount: 195,
    playsCount: 890,
    createdAt: '2026-08-05',
    words: [
      'hippocampus', 'mitochondria', 'neurotransmitter', 'synapse', 'cerebellum', 'vasodilation',
      'myocardial', 'hemoglobin', 'homeostasis', 'epithelial', 'parasympathetic', 'endorphin',
      'acetylcholine', 'dopamine', 'norepinephrine', 'myelin', 'axon', 'dendrite', 'hypophysis',
      'pathogen', 'leukocyte', 'phagocytosis', 'cardiovascular', 'nephron', 'glomerulus',
      'osteoblast', 'neurogenesis', 'coagulation', 'tachycardia', 'bradycardia', 'neuroplasticity'
    ]
  },
  {
    id: 'pack_sat_gre_vocab',
    title: '📚 SAT & GRE Elite Lexicon',
    description: 'Challenging, sophisticated vocabulary curated for competitive scholars and writers.',
    category: 'literature',
    icon: '📚',
    color: '#fbbf24',
    difficulty: 'expert',
    tags: ['vocab', 'sat', 'gre', 'english', 'literature', 'lexicon'],
    author: 'TypeClash Official',
    isOfficial: true,
    likesCount: 412,
    playsCount: 2310,
    createdAt: '2026-08-07',
    words: [
      'ephemeral', 'ubiquitous', 'obfuscate', 'serendipity', 'surreptitious', 'esoteric',
      'perfunctory', 'magnanimous', 'perspicacious', 'capricious', 'sycophant', 'quintessential',
      'obsequious', 'anachronism', 'cacophony', 'enervate', 'fastidious', 'garrulous',
      'iconoclast', 'juxtapose', 'laconic', 'mellifluous', 'nefarious', 'ostentatious',
      'panacea', 'quixotic', 'recalcitrant', 'sanguine', 'trenchant', 'vicarious', 'zephyr'
    ]
  },
  {
    id: 'pack_cyberpunk_hacker',
    title: '🌌 Cyberpunk Hacker',
    description: 'Futuristic sci-fi jargon, cybernetic upgrades, and dystopian netrunner terms.',
    category: 'pop_culture',
    icon: '🌌',
    color: '#a855f7',
    difficulty: 'intermediate',
    tags: ['cyberpunk', 'scifi', 'hacker', 'future', 'gaming'],
    author: 'TypeClash Official',
    isOfficial: true,
    likesCount: 520,
    playsCount: 3100,
    createdAt: '2026-08-10',
    words: [
      'neuralink', 'cyberdeck', 'megacorp', 'biometrics', 'subdermal', 'nanotech', 'quantum',
      'exoskeleton', 'cryostasis', 'hologram', 'dystopia', 'augment', 'singularity', 'firewall',
      'mainframe', 'overdrive', 'cyberware', 'netrunner', 'synthetic', 'blackice', 'cryptochip',
      'stealthsuit', 'telemetry', 'nanobots', 'hyperdrive', 'orbital', 'cybernetics', 'matrix'
    ]
  },
  {
    id: 'pack_anime_romaji',
    title: '🌸 Anime & Japanese (Romaji)',
    description: 'Iconic anime techniques, shonen shouts, and beloved Japanese phrases.',
    category: 'languages',
    icon: '🌸',
    color: '#f43f5e',
    difficulty: 'beginner',
    tags: ['anime', 'japanese', 'romaji', 'manga', 'gaming'],
    author: 'TypeClash Official',
    isOfficial: true,
    likesCount: 680,
    playsCount: 4200,
    createdAt: '2026-08-12',
    words: [
      'kamehameha', 'rasengan', 'itadakimasu', 'sharingan', 'shinobi', 'tsundere', 'arigato',
      'konnichiwa', 'senpai', 'shonen', 'bankai', 'getsuga', 'chocobo', 'kawaii', 'sugoi',
      'daisuki', 'yoroshiku', 'gambatte', 'omoshiroi', 'bakemono', 'subarashii', 'matsuri',
      'katana', 'zanpakuto', 'hokage', 'konoha', 'sasuke', 'naruto', 'tanjiro', 'nezuko'
    ]
  }
];

export function sanitizeWords(rawInput: string): string[] {
  if (!rawInput) return [];
  // Split by newlines, commas, tabs, or spaces
  const tokens = rawInput.split(/[\r\n,;\t]+/);
  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const trimmed = token.trim().toLowerCase().replace(/[^a-z0-9_!?-]/gi, '');
    if (trimmed.length >= 2 && trimmed.length <= 30 && !seen.has(trimmed)) {
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
  }

  return cleaned;
}

export function validateWordPack(pack: Partial<WordPack>): { valid: boolean; error?: string } {
  if (!pack.title || pack.title.trim().length < 3) {
    return { valid: false, error: 'Pack title must be at least 3 characters long.' };
  }
  if (!pack.description || pack.description.trim().length < 5) {
    return { valid: false, error: 'Pack description must be at least 5 characters long.' };
  }
  if (!pack.words || pack.words.length < 10) {
    return { valid: false, error: 'Word pack must contain at least 10 valid words.' };
  }
  return { valid: true };
}
