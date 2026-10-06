/**
 * History-knowledge puzzles. Every answer is grounded in the record of the
 * Katipunan and the outbreak of the Philippine Revolution in August 1896.
 */

export interface HistoryQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answer: number;
  /** Shown after answering, right or wrong. */
  fact: string;
}

export interface NpcProfile {
  id: string;
  name: string;
  title: string;
  color: string;
  greeting: string;
  thanks: string;
  questionIds: string[];
}

export const QUESTIONS: HistoryQuestion[] = [
  {
    id: 'password-katipon',
    prompt: 'A sentry blocks the path: "Password of a first-degree Katipon member?"',
    choices: ['Anak ng Bayan', 'GOMBURZA', 'Rizal', 'Maypagasa'],
    answer: 0,
    fact: 'Katipon (1st degree) used "Anak ng Bayan"; Kawal used "GOMBURZA"; Bayani used "Rizal".',
  },
  {
    id: 'password-kawal',
    prompt: '"Prove you are a Kawal, a second-degree soldier. The password?"',
    choices: ['Rizal', 'GOMBURZA', 'Anak ng Bayan', 'Kalayaan'],
    answer: 1,
    fact: 'Kawal members used "GOMBURZA", honoring the priests Gomez, Burgos and Zamora executed in 1872.',
  },
  {
    id: 'password-bayani',
    prompt: '"Only a Bayani, of the highest degree, may pass. Their password?"',
    choices: ['GOMBURZA', 'Bonifacio', 'Rizal', 'Anak ng Bayan'],
    answer: 2,
    fact: 'Bayani, the third and highest degree, used the password "Rizal".',
  },
  {
    id: 'kkk-meaning',
    prompt: '"If you are truly one of us, what does K.K.K. stand for?"',
    choices: [
      'Kataastaasang Kagalanggalangang Katipunan ng mga Anak ng Bayan',
      'Kapisanan ng Kalayaan at Kapayapaan',
      'Katipunan ng mga Kawal ng Kalayaan',
      'Kongreso ng Kapuluang Katagalugan',
    ],
    answer: 0,
    fact: 'K.K.K.: the Highest and Most Venerable Society of the Children of the Nation.',
  },
  {
    id: 'founding-date',
    prompt: '"When was our Katipunan founded in Tondo?"',
    choices: ['23 August 1896', '7 July 1892', '12 June 1898', '30 December 1896'],
    answer: 1,
    fact: 'Founded 7 July 1892 on Calle Azcarraga, Tondo, as news spread of Rizal\'s exile to Dapitan.',
  },
  {
    id: 'kartilya',
    prompt: '"Who wrote the Kartilya, the primer of teachings every recruit studies?"',
    choices: ['Andrés Bonifacio', 'Apolinario Mabini', 'Emilio Jacinto', 'Marcelo H. del Pilar'],
    answer: 2,
    fact: 'Emilio Jacinto, the "Brains of the Katipunan", wrote the Kartilya ng Katipunan.',
  },
  {
    id: 'kalayaan-paper',
    prompt: '"What is the name of the Katipunan\'s own newspaper?"',
    choices: ['La Solidaridad', 'Kalayaan', 'Diariong Tagalog', 'El Renacimiento'],
    answer: 1,
    fact: 'Kalayaan ("Freedom") printed its single issue in 1896; recruitment soared afterwards.',
  },
  {
    id: 'cedula',
    prompt: '"Tonight, to show we no longer bow to Spain, we will tear up our...?"',
    choices: ['Spanish flags', 'Church records', 'Cédulas', 'Land titles'],
    answer: 2,
    fact: 'Tearing the cédula personal, the colonial tax certificate, marked the Cry of Pugad Lawin.',
  },
  {
    id: 'betrayal',
    prompt: '"Four days ago our secret was exposed. Who revealed the Katipunan to Fr. Mariano Gil?"',
    choices: ['Teodoro Patiño', 'Pío Valenzuela', 'Emilio Aguinaldo', 'Antonio Luna'],
    answer: 0,
    fact: 'On 19 August 1896 Teodoro Patiño revealed the society to Fr. Mariano Gil of Tondo.',
  },
  {
    id: 'dapitan',
    prompt: '"In June I sailed to Dapitan to ask an exile\'s advice on the uprising. Whom?"',
    choices: ['Graciano López Jaena', 'José Rizal', 'Juan Luna', 'Mariano Ponce'],
    answer: 1,
    fact: 'Dr. Pío Valenzuela consulted José Rizal, who judged the people not yet ready to revolt.',
  },
  {
    id: 'blood-compact',
    prompt: '"How does a new member sign the Katipunan oath?"',
    choices: ['With a royal seal', 'With their own blood', 'With charcoal and ink', 'With a thumbprint in wax'],
    answer: 1,
    fact: 'Initiates signed in their own blood, a pacto de sangre echoing the ancient sandugo.',
  },
  {
    id: 'meeting-place',
    prompt: '"Where must the Katipuneros gather tonight to decide on revolt?"',
    choices: ['Intramuros', 'Pugad Lawin, Kalookan', 'Malolos church', 'Fort Santiago'],
    answer: 1,
    fact: 'The Cry took place near Pugad Lawin in Kalookan; historians also argue for Balintawak and Bahay Toro.',
  },
  {
    id: 'bonifacio-alias',
    prompt: '"Every Katipunero has a nom de guerre. What is the Supremo\'s?"',
    choices: ['Pingkian', 'Maypagasa', 'Dimasilaw', 'Lakambini'],
    answer: 1,
    fact: 'Andrés Bonifacio signed as "Maypagasa" ("One who has hope").',
  },
  {
    id: 'jacinto-alias',
    prompt: '"My pen name in the society: what do they call me?"',
    choices: ['Maypagasa', 'Pingkian', 'Plaridel', 'Dimasalang'],
    answer: 1,
    fact: 'Emilio Jacinto wrote as "Pingkian". (Plaridel was del Pilar; Dimasalang was Rizal.)',
  },
];

export const NPC_PROFILES: NpcProfile[] = [
  {
    id: 'bonifacio',
    name: 'Andrés Bonifacio',
    title: 'Supremo of the Katipunan',
    color: '#c0392b',
    greeting: 'Stranger in odd clothes... answer me, and we will know if you are a brother.',
    thanks: 'You speak like a true Anak ng Bayan. Take this. The cause has no use for strange machines.',
    questionIds: ['kkk-meaning', 'founding-date', 'kartilya', 'bonifacio-alias', 'cedula'],
  },
  {
    id: 'jacinto',
    name: 'Emilio Jacinto',
    title: 'Brains of the Katipunan',
    color: '#2e86c1',
    greeting: 'A scholar of the future? Then a question for a scholar.',
    thanks: 'Remarkable. Knowledge is a weapon. Here, take what you came for.',
    questionIds: ['kalayaan-paper', 'jacinto-alias', 'password-kawal', 'kkk-meaning'],
  },
  {
    id: 'tandang-sora',
    name: 'Melchora Aquino',
    title: '"Tandang Sora", Mother of the Katipunan',
    color: '#d68910',
    greeting: 'Hijo, hija: you look hungry and lost. Tell an old woman what you know.',
    thanks: 'Take this, and some rice for the road. My store in Banlat is always open to the brave.',
    questionIds: ['meeting-place', 'blood-compact', 'cedula', 'password-katipon'],
  },
  {
    id: 'gregoria',
    name: 'Gregoria de Jesús',
    title: 'Lakambini of the Katipunan',
    color: '#8e44ad',
    greeting: 'I guard the society\'s papers and seal. Prove I can trust you.',
    thanks: 'You may be trusted. I hid this among the documents. Go, quickly.',
    questionIds: ['password-bayani', 'betrayal', 'founding-date', 'blood-compact'],
  },
  {
    id: 'valenzuela',
    name: 'Dr. Pío Valenzuela',
    title: 'Physician and Katipunan envoy',
    color: '#16a085',
    greeting: 'Patience, patience. Every rash move now costs lives. Answer carefully.',
    thanks: 'Sound judgement. Take this, and may it carry you home.',
    questionIds: ['dapitan', 'betrayal', 'kalayaan-paper', 'password-kawal'],
  },
  {
    id: 'sentry',
    name: 'Katipunero Sentry',
    title: 'Lookout on the Pugad Lawin road',
    color: '#7f8c8d',
    greeting: 'Halt. Nobody passes this road without the word.',
    thanks: 'Pass, kapatid. Here, someone dropped this strange gear by the road.',
    questionIds: ['password-katipon', 'password-kawal', 'password-bayani', 'meeting-place'],
  },
];

export function questionById(id: string): HistoryQuestion {
  const q = QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown question ${id}`);
  return q;
}

export function profileById(id: string): NpcProfile {
  const p = NPC_PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown NPC profile ${id}`);
  return p;
}
