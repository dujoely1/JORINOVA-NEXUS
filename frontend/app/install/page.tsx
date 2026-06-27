'use client'

/**
 * First-run installation wizard — the 6-step ALIS-X installer.
 *
 * Lands here automatically the first time anyone hits the system if no
 * hospital + admin exist yet (GET /api/v1/setup/status). Six screens:
 *
 *   1. Welcome             — brand splash + system language picker
 *   2. Facility            — name, lab code, country/city, address, type, logo
 *   3. License & Security  — license key, administrator account, master
 *                            password, post-quantum / biometric / AI toggles
 *   4. Staff               — add staff (name + mobile + role); each gets an
 *                            auto-generated login + temp password
 *   5. Hardware            — this computer, analysers, cold-chain / IoT devices
 *   6. Complete            — summary + downloadable config + Launch ALIS-X
 *
 * Calls POST /api/v1/setup/init once; the backend refuses with 409 if
 * anyone else has already initialised, so this page cannot overwrite a
 * live install. Everything is persisted in a single transaction.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Logo from '../components/Logo'

const API           = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const NEXUS_BLUE    = '#0066CC'
const NEXUS_BLUE_LT = '#E6F0FA'
const MIL_GREEN     = '#4B5320'
const GOLD_DK       = '#A6800F'

type Lang = 'en' | 'fr' | 'rw'
type Step = 'welcome' | 'facility' | 'license' | 'staff' | 'hardware' | 'done'
const STEP_ORDER: Step[] = ['welcome', 'facility', 'license', 'staff', 'hardware', 'done']

type StaffRow    = { fullName: string; phone: string; role: string; department: string }
type AnalyserRow = { name: string; model: string; department: string; connection: string }
type DeviceRow   = { name: string; deviceType: string; location: string; minTemp: string; maxTemp: string; iotSensor: boolean }

type SetupResult = {
  message: string; hospital_id: number; lab_code: string | null; admin_user_id: number
  language: string; staff_created: number; analysers_created: number; devices_created: number
  sms_queued: number
  staff_credentials: { full_name: string; username: string; role: string; phone: string | null; temp_password: string }[]
}

const LANG_OPTIONS: { code: Lang; label: string; native: string; flag: string }[] = [
  { code: 'en', label: 'English',     native: 'English',      flag: '🇬🇧' },
  { code: 'fr', label: 'French',      native: 'Français',     flag: '🇫🇷' },
  { code: 'rw', label: 'Kinyarwanda', native: 'Ikinyarwanda', flag: '🇷🇼' },
]

// Role keys map 1:1 to the backend ROLE_MAP keys in routers/setup.py.
const ROLE_KEYS = [
  'lab_manager', 'senior_technologist', 'technologist', 'lab_receptionist',
  'doctor', 'department_head', 'quality_manager', 'head_of_department',
  'department_supervisor', 'administrator', 'finance_officer', 'viewer',
] as const

const FACILITY_TYPES = ['public', 'private', 'reference_lab', 'blood_bank', 'other'] as const

type Copy = {
  installSub: string; tagline: string; loading: string; setupFailed: string; powered: string; online: string
  steps: string[]
  // welcome
  welcomeTo: string; systemName: string; systemTag: string; welcomeIntro: string; begin: string; chooseLang: string
  // facility
  facility: string; facilitySub: string
  fName: string; fLabCode: string; fLabCodeHint: string; fCountry: string; fCity: string; fDistrict: string
  fAddress: string; fPhone: string; fEmail: string; fLogo: string; fLogoHint: string; fType: string
  types: Record<(typeof FACILITY_TYPES)[number], string>
  // license & security
  license: string; licenseSub: string; licenseKey: string; validate: string; validated: string
  adminName: string; adminPhone: string; adminEmail: string; masterPwd: string; confirmPwd: string
  pwdMismatch: string; pwdWeak: string; pwdStrong: string
  security: string; secPQ: string; secBio: string; secAI: string; secAudit: string; secBackup: string; keysNote: string
  // staff
  staff: string; staffSub: string; sFullName: string; sMobile: string; sRole: string; sDept: string; add: string
  colName: string; colMobile: string; colRole: string; colDept: string; colAction: string; smsNote: string; noStaff: string
  roles: Record<(typeof ROLE_KEYS)[number], string>
  // hardware
  hardware: string; hardwareSub: string
  thisComputer: string; compName: string; os: string; ram: string; serverRole: string; printerConnected: string
  brand: string; model: string; printerType: string; analysers: string; addAnalyser: string; aName: string
  aModel: string; aDept: string; connection: string; connManual: string; connBarcode: string; connHl7: string
  coldChain: string; addDevice: string; dName: string; dLocation: string; minTemp: string; maxTemp: string; iotSensor: string
  refrigerator: string; freezer: string; incubator: string; yes: string; no: string; added: string
  // done
  done: string; doneSub: string; sumFacility: string; sumLabCode: string; sumLicense: string; sumStaff: string
  sumAnalysers: string; sumDevices: string; sumSecurity: string; sumLang: string; credsTitle: string
  download: string; launch: string; credsNote: string; summaryNote: string
  // common
  next: string; back: string; finish: string; saving: string; required: string
}

const COPY: Record<Lang, Copy> = {
  en: {
    installSub: 'First-run installation', tagline: 'Smart data. Safer health.', loading: 'Loading…',
    setupFailed: 'Setup failed', powered: 'Powered by JORINOVA NEXUS ALIS-X', online: 'Online',
    steps: ['Welcome', 'Facility', 'Security', 'Staff', 'Hardware', 'Finish'],
    welcomeTo: 'Welcome to', systemName: 'Jorinova Nexus',
    systemTag: 'Advanced Laboratory Intelligence System — Extreme',
    welcomeIntro: 'This wizard will configure ALIS-X for your facility. Please have your license key, facility details, and hardware information ready.',
    begin: 'Begin Installation', chooseLang: 'System language',
    facility: 'Facility Information', facilitySub: 'Identifies the facility on every report, label and signed result.',
    fName: 'Hospital / Laboratory Name', fLabCode: 'Lab Code (Abbreviation)', fLabCodeHint: 'Used as system ID',
    fCountry: 'Country', fCity: 'City / District', fDistrict: 'District', fAddress: 'Full Address',
    fPhone: 'Phone Number', fEmail: 'Email Address', fLogo: 'Facility Logo', fLogoHint: 'Click to upload logo (PNG/JPG)',
    fType: 'Facility Type',
    types: { public: 'Public Hospital', private: 'Private Clinic', reference_lab: 'Reference Lab', blood_bank: 'Blood Bank', other: 'Other' },
    license: 'License & Security Setup', licenseSub: 'Activate the license and set up the system administrator.',
    licenseKey: 'License Key', validate: 'Validate Key', validated: 'Validated',
    adminName: 'Authorized Administrator Name', adminPhone: 'Administrator Phone (Mobile)', adminEmail: 'Administrator Email',
    masterPwd: 'Set Master Password', confirmPwd: 'Confirm Password',
    pwdMismatch: 'Passwords do not match', pwdWeak: 'Weak — use 8+ chars', pwdStrong: 'Strong Password',
    security: 'Security Features', secPQ: 'Post-Quantum Encryption (Kyber768)', secBio: 'Biometric Authentication',
    secAI: 'AI Cyberattack Detection', secAudit: 'Audit Logs', secBackup: 'Automatic Encrypted Backup',
    keysNote: 'Security keys will be generated automatically after setup completes.',
    staff: 'Staff Registration & Role Assignment', staffSub: 'Add staff who will use ALIS-X. You can add more later.',
    sFullName: 'Full Name', sMobile: 'Mobile Number', sRole: 'Role', sDept: 'Department', add: 'Add',
    colName: 'Name', colMobile: 'Mobile', colRole: 'Role', colDept: 'Department', colAction: 'Action',
    smsNote: 'Each staff member receives login credentials via SMS to their mobile number.',
    noStaff: 'No staff added yet — you can add them later from Settings.',
    roles: {
      lab_manager: 'Lab Manager', senior_technologist: 'Senior Technologist', technologist: 'Technologist',
      lab_receptionist: 'Lab Receptionist', doctor: 'Doctor (Client)', department_head: 'Department Head',
      quality_manager: 'Quality Manager', head_of_department: 'Head of Department',
      department_supervisor: 'Department Supervisor', administrator: 'Administrator', finance_officer: 'Finance Officer',
      viewer: 'Viewer (Read-only)',
    },
    hardware: 'Hardware Setup', hardwareSub: 'Configure all hardware connected to ALIS-X. You can add more devices later from Settings.',
    thisComputer: 'This Computer', compName: 'Computer Name', os: 'Operating System', ram: 'RAM', serverRole: 'Role',
    printerConnected: 'Printer connected', brand: 'Brand', model: 'Model', printerType: 'Type',
    analysers: 'Laboratory Analysers', addAnalyser: 'Add Analyser', aName: 'Name / Brand', aModel: 'Model', aDept: 'Department',
    connection: 'Connection', connManual: 'Manual Entry', connBarcode: 'Barcode Scan', connHl7: 'HL7 / FHIR',
    coldChain: 'Cold Chain & IoT', addDevice: 'Add Device', dName: 'Name', dLocation: 'Location / Department',
    minTemp: 'Min Temp (°C)', maxTemp: 'Max Temp (°C)', iotSensor: 'IoT Sensor',
    refrigerator: 'Refrigerators', freezer: 'Freezers', incubator: 'Incubators', yes: 'Yes', no: 'No', added: 'Added',
    done: 'Installation Complete', doneSub: 'ALIS-X is ready. Smart data. Safer health.',
    sumFacility: 'Facility Name', sumLabCode: 'Lab Code', sumLicense: 'License', sumStaff: 'Staff Registered',
    sumAnalysers: 'Analysers', sumDevices: 'Cold Chain / Devices', sumSecurity: 'Security', sumLang: 'Languages',
    credsTitle: 'Staff login credentials (also sent via SMS)',
    download: 'Download Config File', launch: 'Launch ALIS-X →',
    credsNote: 'Login credentials will be sent via SMS to all registered staff upon launch.',
    summaryNote: 'Installation summary will be sent to the administrator email and mobile upon launch.',
    next: 'Next', back: 'Back', finish: 'Finish Installation', saving: 'Installing…', required: 'required',
  },
  fr: {
    installSub: 'Installation initiale', tagline: 'Données intelligentes. Santé plus sûre.', loading: 'Chargement…',
    setupFailed: 'Échec de l’installation', powered: 'Propulsé par JORINOVA NEXUS ALIS-X', online: 'En ligne',
    steps: ['Accueil', 'Établissement', 'Sécurité', 'Personnel', 'Matériel', 'Fin'],
    welcomeTo: 'Bienvenue sur', systemName: 'Jorinova Nexus',
    systemTag: 'Système d’Intelligence de Laboratoire Avancé — Extreme',
    welcomeIntro: 'Cet assistant configure ALIS-X pour votre établissement. Préparez votre clé de licence, les détails de l’établissement et les informations matérielles.',
    begin: 'Démarrer l’installation', chooseLang: 'Langue du système',
    facility: 'Informations de l’établissement', facilitySub: 'Identifie l’établissement sur chaque rapport, étiquette et résultat signé.',
    fName: 'Nom de l’hôpital / laboratoire', fLabCode: 'Code labo (abréviation)', fLabCodeHint: 'Utilisé comme ID système',
    fCountry: 'Pays', fCity: 'Ville / District', fDistrict: 'District', fAddress: 'Adresse complète',
    fPhone: 'Téléphone', fEmail: 'E-mail', fLogo: 'Logo de l’établissement', fLogoHint: 'Cliquez pour téléverser (PNG/JPG)',
    fType: 'Type d’établissement',
    types: { public: 'Hôpital public', private: 'Clinique privée', reference_lab: 'Labo de référence', blood_bank: 'Banque de sang', other: 'Autre' },
    license: 'Licence et sécurité', licenseSub: 'Activez la licence et configurez l’administrateur du système.',
    licenseKey: 'Clé de licence', validate: 'Valider la clé', validated: 'Validée',
    adminName: 'Nom de l’administrateur autorisé', adminPhone: 'Téléphone administrateur (mobile)', adminEmail: 'E-mail administrateur',
    masterPwd: 'Mot de passe maître', confirmPwd: 'Confirmer le mot de passe',
    pwdMismatch: 'Les mots de passe ne correspondent pas', pwdWeak: 'Faible — 8+ caractères', pwdStrong: 'Mot de passe fort',
    security: 'Fonctions de sécurité', secPQ: 'Chiffrement post-quantique (Kyber768)', secBio: 'Authentification biométrique',
    secAI: 'Détection IA des cyberattaques', secAudit: 'Journaux d’audit', secBackup: 'Sauvegarde chiffrée automatique',
    keysNote: 'Les clés de sécurité seront générées automatiquement après l’installation.',
    staff: 'Inscription du personnel et rôles', staffSub: 'Ajoutez le personnel qui utilisera ALIS-X. Vous pourrez en ajouter plus tard.',
    sFullName: 'Nom complet', sMobile: 'Numéro mobile', sRole: 'Rôle', sDept: 'Département', add: 'Ajouter',
    colName: 'Nom', colMobile: 'Mobile', colRole: 'Rôle', colDept: 'Département', colAction: 'Action',
    smsNote: 'Chaque membre du personnel reçoit ses identifiants par SMS sur son mobile.',
    noStaff: 'Aucun personnel ajouté — vous pourrez le faire plus tard dans Paramètres.',
    roles: {
      lab_manager: 'Responsable labo', senior_technologist: 'Technologue senior', technologist: 'Technologue',
      lab_receptionist: 'Réceptionniste labo', doctor: 'Médecin (client)', department_head: 'Chef de département',
      quality_manager: 'Responsable qualité', head_of_department: 'Chef de service',
      department_supervisor: 'Superviseur de département', administrator: 'Administrateur', finance_officer: 'Responsable finances',
      viewer: 'Lecteur (lecture seule)',
    },
    hardware: 'Configuration du matériel', hardwareSub: 'Configurez tout le matériel connecté à ALIS-X. Vous pourrez en ajouter plus tard.',
    thisComputer: 'Cet ordinateur', compName: 'Nom de l’ordinateur', os: 'Système d’exploitation', ram: 'RAM', serverRole: 'Rôle',
    printerConnected: 'Imprimante connectée', brand: 'Marque', model: 'Modèle', printerType: 'Type',
    analysers: 'Analyseurs de laboratoire', addAnalyser: 'Ajouter un analyseur', aName: 'Nom / marque', aModel: 'Modèle', aDept: 'Département',
    connection: 'Connexion', connManual: 'Saisie manuelle', connBarcode: 'Code-barres', connHl7: 'HL7 / FHIR',
    coldChain: 'Chaîne du froid & IoT', addDevice: 'Ajouter un appareil', dName: 'Nom', dLocation: 'Emplacement / département',
    minTemp: 'Temp. min (°C)', maxTemp: 'Temp. max (°C)', iotSensor: 'Capteur IoT',
    refrigerator: 'Réfrigérateurs', freezer: 'Congélateurs', incubator: 'Incubateurs', yes: 'Oui', no: 'Non', added: 'Ajoutés',
    done: 'Installation terminée', doneSub: 'ALIS-X est prêt. Données intelligentes. Santé plus sûre.',
    sumFacility: 'Nom de l’établissement', sumLabCode: 'Code labo', sumLicense: 'Licence', sumStaff: 'Personnel inscrit',
    sumAnalysers: 'Analyseurs', sumDevices: 'Chaîne du froid / appareils', sumSecurity: 'Sécurité', sumLang: 'Langues',
    credsTitle: 'Identifiants du personnel (également envoyés par SMS)',
    download: 'Télécharger le fichier de config', launch: 'Lancer ALIS-X →',
    credsNote: 'Les identifiants seront envoyés par SMS à tout le personnel inscrit au lancement.',
    summaryNote: 'Le résumé d’installation sera envoyé à l’e-mail et au mobile de l’administrateur au lancement.',
    next: 'Suivant', back: 'Retour', finish: 'Terminer l’installation', saving: 'Installation…', required: 'requis',
  },
  rw: {
    installSub: 'Iyinjiza rya mbere', tagline: 'Amakuru y’ubwenge. Ubuzima burinzwe.', loading: 'Birapakira…',
    setupFailed: 'Iyinjiza ryanze', powered: 'Yashyizweho na JORINOVA NEXUS ALIS-X', online: 'Kuri interineti',
    steps: ['Ikaze', 'Ikigo', 'Umutekano', 'Abakozi', 'Ibikoresho', 'Soza'],
    welcomeTo: 'Murakaza neza kuri', systemName: 'Jorinova Nexus',
    systemTag: 'Sisitemu y’Ubwenge bwa Laboratwari — Extreme',
    welcomeIntro: 'Iyi nyobozi izategura ALIS-X ku kigo cyawe. Itegure urufunguzo rwa licence, amakuru y’ikigo, n’amakuru y’ibikoresho.',
    begin: 'Tangira Iyinjiza', chooseLang: 'Ururimi rwa sisitemu',
    facility: 'Amakuru y’ikigo', facilitySub: 'Ibyo bigaragara kuri raporo, ibimenyetso, n’ibyemezo by’ibisubizo.',
    fName: 'Izina ry’ibitaro / laboratwari', fLabCode: 'Kode ya labo (impine)', fLabCodeHint: 'Ikoreshwa nka ID ya sisitemu',
    fCountry: 'Igihugu', fCity: 'Umujyi / Akarere', fDistrict: 'Akarere', fAddress: 'Aderesi yuzuye',
    fPhone: 'Telefoni', fEmail: 'Imeyili', fLogo: 'Ikirango cy’ikigo', fLogoHint: 'Kanda wohereze ikirango (PNG/JPG)',
    fType: 'Ubwoko bw’ikigo',
    types: { public: 'Ibitaro bya Leta', private: 'Ivuriro ryigenga', reference_lab: 'Labo y’icyitegererezo', blood_bank: 'Ibanki y’amaraso', other: 'Ikindi' },
    license: 'Licence n’Umutekano', licenseSub: 'Emeza licence kandi ushyireho umuyobozi wa sisitemu.',
    licenseKey: 'Urufunguzo rwa licence', validate: 'Emeza urufunguzo', validated: 'Byemejwe',
    adminName: 'Izina ry’umuyobozi wemewe', adminPhone: 'Telefoni y’umuyobozi (mobile)', adminEmail: 'Imeyili y’umuyobozi',
    masterPwd: 'Shyiraho ijambo ry’ibanga rikuru', confirmPwd: 'Emeza ijambo ry’ibanga',
    pwdMismatch: 'Amagambo y’ibanga ntahuye', pwdWeak: 'Rifite intege nke — koresha inyuguti 8+', pwdStrong: 'Ijambo ry’ibanga rikomeye',
    security: 'Ibiranga umutekano', secPQ: ' Ihumeka rya Post-Quantum (Kyber768)', secBio: 'Kwemeza ukoresheje umubiri',
    secAI: 'AI itahura ibitero bya cyber', secAudit: 'Inyandiko z’igenzura', secBackup: 'Ubwiherero bwikora bushyinguwe',
    keysNote: 'Imfunguzo z’umutekano zizakorwa mu buryo bwikora nyuma yo kurangiza.',
    staff: 'Kwiyandikisha kw’abakozi n’inshingano', staffSub: 'Ongeraho abakozi bazakoresha ALIS-X. Ushobora kongeraho nyuma.',
    sFullName: 'Amazina yombi', sMobile: 'Numero ya mobile', sRole: 'Inshingano', sDept: 'Ishami', add: 'Ongeraho',
    colName: 'Izina', colMobile: 'Mobile', colRole: 'Inshingano', colDept: 'Ishami', colAction: 'Igikorwa',
    smsNote: 'Buri mukozi azabona amakuru yo kwinjira binyuze kuri SMS kuri telefoni ye.',
    noStaff: 'Nta bakozi barongewemo — ushobora kubongeraho nyuma muri Igenamiterere.',
    roles: {
      lab_manager: 'Umuyobozi wa labo', senior_technologist: 'Umuhanga w’umukuru', technologist: 'Umuhanga mu bya tekiniki',
      lab_receptionist: 'Umwakira wa labo', doctor: 'Muganga (umukiriya)', department_head: 'Umukuru w’ishami',
      quality_manager: 'Umuyobozi w’ubuziranenge', head_of_department: 'Umuyobozi w’ishami',
      department_supervisor: 'Umugenzuzi w’ishami', administrator: 'Umuyobozi', finance_officer: 'Umukozi w’imari',
      viewer: 'Urebera (gusoma gusa)',
    },
    hardware: 'Igenamiterere ry’ibikoresho', hardwareSub: 'Tegura ibikoresho byose bihujwe na ALIS-X. Ushobora kongeraho nyuma muri Igenamiterere.',
    thisComputer: 'Iyi mudasobwa', compName: 'Izina rya mudasobwa', os: 'Sisitemu y’imikorere', ram: 'RAM', serverRole: 'Inshingano',
    printerConnected: 'Mudasobwa ifite mucapyi', brand: 'Ikirango', model: 'Modeli', printerType: 'Ubwoko',
    analysers: 'Imashini za laboratwari', addAnalyser: 'Ongeraho imashini', aName: 'Izina / ikirango', aModel: 'Modeli', aDept: 'Ishami',
    connection: 'Ukwihuza', connManual: 'Kwinjiza n’intoki', connBarcode: 'Gusoma barcode', connHl7: 'HL7 / FHIR',
    coldChain: 'Cold Chain & IoT', addDevice: 'Ongeraho igikoresho', dName: 'Izina', dLocation: 'Aho giherereye / ishami',
    minTemp: 'Ubushyuhe buke (°C)', maxTemp: 'Ubushyuhe bwinshi (°C)', iotSensor: 'Sensor ya IoT',
    refrigerator: 'Frigo', freezer: 'Konjelateri', incubator: 'Incubateri', yes: 'Yego', no: 'Oya', added: 'Byongeweho',
    done: 'Iyinjiza ryarangiye', doneSub: 'ALIS-X yiteguye. Amakuru y’ubwenge. Ubuzima burinzwe.',
    sumFacility: 'Izina ry’ikigo', sumLabCode: 'Kode ya labo', sumLicense: 'Licence', sumStaff: 'Abakozi banditswe',
    sumAnalysers: 'Imashini', sumDevices: 'Cold Chain / Ibikoresho', sumSecurity: 'Umutekano', sumLang: 'Indimi',
    credsTitle: 'Amakuru yo kwinjira y’abakozi (anyura na SMS)',
    download: 'Kuramo dosiye ya config', launch: 'Tangiza ALIS-X →',
    credsNote: 'Amakuru yo kwinjira azoherezwa kuri SMS ku bakozi bose banditswe igihe cyo gutangira.',
    summaryNote: 'Incamake y’iyinjiza izoherezwa kuri imeyili na telefoni by’umuyobozi igihe cyo gutangira.',
    next: 'Komeza', back: 'Subira', finish: 'Soza Iyinjiza', saving: 'Birinjira…', required: 'birakenewe',
  },
}


function pwScore(pw: string): number {
  let s = 0
  if (pw.length >= 8) s += 35
  if (pw.length >= 12) s += 15
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 20
  if (/\d/.test(pw)) s += 15
  if (/[^A-Za-z0-9]/.test(pw)) s += 15
  return Math.min(100, s)
}


export default function InstallPage() {
  const router = useRouter()
  const [step,    setStep]    = useState<Step>('welcome')
  const [lang,    setLang]    = useState<Lang>('en')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result,  setResult]  = useState<SetupResult | null>(null)
  const [clock,   setClock]   = useState('')

  // Facility
  const [fName, setFName]         = useState('')
  const [fLabCode, setFLabCode]   = useState('')
  const [fCountry, setFCountry]   = useState('Rwanda')
  const [fCity, setFCity]         = useState('')
  const [fAddress, setFAddress]   = useState('')
  const [fPhone, setFPhone]       = useState('')
  const [fEmail, setFEmail]       = useState('')
  const [fType, setFType]         = useState<(typeof FACILITY_TYPES)[number]>('public')
  const [logo, setLogo]           = useState<string>('')
  const logoInput = useRef<HTMLInputElement>(null)

  // License & security
  const [licenseKey, setLicenseKey]       = useState('')
  const [licenseOk, setLicenseOk]         = useState(false)
  const [adminName, setAdminName]         = useState('')
  const [adminPhone, setAdminPhone]       = useState('')
  const [adminEmail, setAdminEmail]       = useState('')
  const [pwd, setPwd]                     = useState('')
  const [pwd2, setPwd2]                   = useState('')
  const [secPQ, setSecPQ]                 = useState(true)
  const [secBio, setSecBio]               = useState(true)
  const [secAI, setSecAI]                 = useState(true)
  const [secAudit, setSecAudit]           = useState(true)
  const [secBackup, setSecBackup]         = useState(true)

  // Staff
  const [staff, setStaff]   = useState<StaffRow[]>([])
  const [sRow, setSRow]     = useState<StaffRow>({ fullName: '', phone: '', role: 'lab_manager', department: '' })

  // Hardware — this computer
  const [cName, setCName]       = useState('ALISX-SERVER-01')
  const [cOS, setCOS]           = useState('Ubuntu')
  const [cRAM, setCRAM]         = useState('16GB')
  const [cRole, setCRole]       = useState('server')
  const [cPrinter, setCPrinter] = useState(true)
  const [cBrand, setCBrand]     = useState('')
  const [cModel, setCModel]     = useState('')
  const [cType, setCType]       = useState('a4')
  // analysers
  const [analysers, setAnalysers] = useState<AnalyserRow[]>([])
  const [aRow, setARow] = useState<AnalyserRow>({ name: '', model: '', department: 'Hematology', connection: 'hl7_fhir' })
  // cold chain
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [dRow, setDRow] = useState<DeviceRow>({ name: '', deviceType: 'refrigerator', location: '', minTemp: '2', maxTemp: '8', iotSensor: true })

  const t = COPY[lang]

  // Redirect away if setup already done — unless ?preview=1 (view-only; the
  // backend still refuses re-init with 409, so preview can't overwrite a live install).
  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get('preview') === '1'
    if (preview) { setLoading(false); return }
    fetch(`${API}/api/v1/setup/status`)
      .then(r => r.json())
      .then(d => { if (!d.needs_setup) router.replace('/login'); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  // Live clock (header, matches mockups)
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogo(String(reader.result))
    reader.readAsDataURL(file)
  }

  function addStaff() {
    if (!sRow.fullName.trim()) return
    setStaff(s => [...s, sRow])
    setSRow({ fullName: '', phone: '', role: sRow.role, department: '' })
  }
  function addAnalyser() {
    if (!aRow.name.trim()) return
    setAnalysers(a => [...a, aRow])
    setARow({ name: '', model: '', department: aRow.department, connection: aRow.connection })
  }
  function addDevice() {
    if (!dRow.name.trim()) return
    setDevices(d => [...d, dRow])
    setDRow({ name: '', deviceType: dRow.deviceType, location: '', minTemp: dRow.minTemp, maxTemp: dRow.maxTemp, iotSensor: dRow.iotSensor })
  }

  const adminParts = adminName.trim().split(/\s+/).filter(Boolean)
  const licenseStepValid =
    adminName.trim().length > 1 && adminEmail.trim().includes('@') && pwd.length >= 8 && pwd === pwd2

  async function submit() {
    setError(null); setSubmitting(true)
    try {
      const payload = {
        language: lang,
        hospital_name: fName.trim(),
        hospital_lab_code: fLabCode.trim() || null,
        hospital_country: fCountry.trim() || null,
        hospital_city: fCity.trim() || null,
        hospital_district: fCity.trim() || null,
        hospital_address: fAddress.trim() || null,
        hospital_phone: fPhone.trim() || null,
        hospital_email: fEmail.trim() || null,
        hospital_type: fType,
        hospital_logo: logo || null,
        license_key: licenseKey.trim() || null,
        security: { post_quantum: secPQ, biometric: secBio, ai_cyberattack: secAI, audit_logs: secAudit, auto_backup: secBackup },
        admin_username: 'admin',
        admin_first_name: adminParts[0] ?? 'Admin',
        admin_last_name: adminParts.slice(1).join(' ') || (adminParts[0] ?? 'Administrator'),
        admin_email: adminEmail.trim(),
        admin_phone: adminPhone.trim() || null,
        admin_password: pwd,
        staff: staff.map(s => ({ full_name: s.fullName.trim(), phone: s.phone.trim() || null, role: s.role, department: s.department.trim() || null })),
        computer: { name: cName.trim() || null, os: cOS || null, ram: cRAM || null, role: cRole || null, printer_connected: cPrinter, printer_brand: cBrand.trim() || null, printer_model: cModel.trim() || null, printer_type: cType || null },
        analysers: analysers.map(a => ({ name: a.name.trim(), model: a.model.trim() || null, department: a.department || null, connection: a.connection || null })),
        cold_chain: devices.map(d => ({ name: d.name.trim(), device_type: d.deviceType, location: d.location.trim() || null, min_temp: d.minTemp ? Number(d.minTemp) : null, max_temp: d.maxTemp ? Number(d.maxTemp) : null, iot_sensor: d.iotSensor })),
      }
      const r = await fetch(`${API}/api/v1/setup/init`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}))
        throw new Error(typeof detail.detail === 'string' ? detail.detail : `HTTP ${r.status}`)
      }
      setResult(await r.json())
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : t.setupFailed)
    } finally {
      setSubmitting(false)
    }
  }

  function downloadConfig() {
    const cfg = {
      facility: { name: fName, lab_code: fLabCode, country: fCountry, city: fCity, address: fAddress, phone: fPhone, email: fEmail, type: fType },
      language: lang, license_key: licenseKey,
      security: { post_quantum: secPQ, biometric: secBio, ai_cyberattack: secAI, audit_logs: secAudit, auto_backup: secBackup },
      administrator: { name: adminName, phone: adminPhone, email: adminEmail, username: 'admin' },
      staff_credentials: result?.staff_credentials ?? [],
      hardware: {
        computer: { name: cName, os: cOS, ram: cRAM, role: cRole, printer: cPrinter ? { brand: cBrand, model: cModel, type: cType } : null },
        analysers, cold_chain: devices,
      },
      installed_at: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `alisx-config-${(fLabCode || 'facility').toLowerCase()}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">{t.loading}</div>
  }

  const stepIdx = STEP_ORDER.indexOf(step)

  return (
    <div className="min-h-screen flex flex-col"
         style={{ background: `linear-gradient(180deg, ${NEXUS_BLUE_LT} 0%, #FFFFFF 50%, ${NEXUS_BLUE_LT} 100%)` }}>
      {/* Branded header */}
      <header className="text-white shadow-md" style={{ background: `linear-gradient(90deg, ${NEXUS_BLUE} 0%, #1E88E5 100%)` }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Logo size={48} className="ring-1 ring-white/40" />
          <div className="leading-tight">
            <div className="font-bold tracking-wide text-base">JORINOVA NEXUS · ALIS-X</div>
            <div className="text-xs text-blue-100 -mt-0.5">{t.installSub}</div>
          </div>
          <div className="ml-auto flex items-center gap-4 text-right">
            <div className="font-mono text-lg leading-none">{clock}</div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> {t.online}
            </div>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <section className="border-b" style={{ borderColor: `${NEXUS_BLUE}30`, background: 'rgba(255,255,255,0.65)' }}>
        <div className="mx-auto max-w-3xl px-4 py-5">
          <Stepper labels={t.steps} idx={stepIdx} />
        </div>
      </section>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl p-6 sm:p-8"
             style={{ border: `2px solid ${NEXUS_BLUE}`, boxShadow: `0 12px 40px ${NEXUS_BLUE}33` }}>
          {error && (
            <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>
          )}

          {/* ── Step 1: welcome ── */}
          {step === 'welcome' && (
            <div className="text-center py-6">
              <p className="text-zinc-700">{t.welcomeTo}</p>
              <h1 className="text-4xl sm:text-5xl font-extrabold" style={{ color: NEXUS_BLUE }}>{t.systemName}</h1>
              <p className="mt-2 text-lg font-semibold" style={{ color: '#1E88E5' }}>{t.systemTag}</p>
              <p className="mt-2 italic font-bold" style={{ color: GOLD_DK }}>{t.tagline}</p>
              <p className="mt-6 mx-auto max-w-xl text-sm text-zinc-600">{t.welcomeIntro}</p>

              <div className="mt-7">
                <div className="text-xs font-semibold text-zinc-500 mb-2">{t.chooseLang}</div>
                <div className="flex justify-center gap-3">
                  {LANG_OPTIONS.map(opt => {
                    const active = opt.code === lang
                    return (
                      <button key={opt.code} onClick={() => setLang(opt.code)}
                        className="rounded-xl px-5 py-3 border-2 transition-all flex flex-col items-center gap-0.5"
                        style={{ borderColor: active ? NEXUS_BLUE : '#E4E4E7', background: active ? '#EFF6FF' : 'white', boxShadow: active ? `0 0 0 4px ${NEXUS_BLUE}22` : 'none' }}>
                        <div className="text-2xl">{opt.flag}</div>
                        <div className="text-xs font-semibold text-zinc-700">{opt.native}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <button onClick={() => setStep('facility')}
                className="mt-8 px-8 py-3 rounded-lg text-white font-semibold shadow-sm" style={{ background: NEXUS_BLUE }}>
                {t.begin} →
              </button>
            </div>
          )}

          {/* ── Step 2: facility ── */}
          {step === 'facility' && (
            <>
              <SectionTitle title={t.facility} sub={t.facilitySub} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label={t.fName} value={fName} onChange={setFName} required req={t.required} className="sm:col-span-2" />
                <div>
                  <Field label={t.fLabCode} value={fLabCode} onChange={v => setFLabCode(v.toUpperCase())} placeholder="e.g. KUTH-LAB-001" />
                  <span className="text-[11px] text-zinc-400">{t.fLabCodeHint}</span>
                </div>
                <SelectField label={t.fCountry} value={fCountry} onChange={setFCountry}
                  options={['Rwanda', 'Burundi', 'DR Congo', 'Kenya', 'Tanzania', 'Uganda', 'Other'].map(c => ({ value: c, label: c }))} />
                <Field label={t.fCity} value={fCity} onChange={setFCity} placeholder="e.g. Gasabo District" />
                <Field label={t.fPhone} value={fPhone} onChange={setFPhone} placeholder="+250 788 123 456" />
                <Field label={t.fAddress} value={fAddress} onChange={setFAddress} className="sm:col-span-2" />
                <Field label={t.fEmail} value={fEmail} onChange={setFEmail} type="email" placeholder="info@facility.rw" />

                <div>
                  <span className="block text-xs font-medium text-zinc-700 mb-1">{t.fType}</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FACILITY_TYPES.map(ft => (
                      <label key={ft} className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                        <input type="radio" name="ftype" checked={fType === ft} onChange={() => setFType(ft)} /> {t.types[ft]}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <span className="block text-xs font-medium text-zinc-700 mb-1">{t.fLogo}</span>
                  <button type="button" onClick={() => logoInput.current?.click()}
                    className="w-full rounded-lg border-2 border-dashed border-zinc-300 py-5 flex flex-col items-center gap-1 hover:border-blue-400">
                    {logo
                      ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="logo" className="h-14 object-contain" />
                      : <><span className="text-2xl">⬆️</span><span className="text-xs text-zinc-500">{t.fLogoHint}</span></>}
                  </button>
                  <input ref={logoInput} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onLogo} />
                </div>
              </div>
              <NavRow onBack={() => setStep('welcome')} backLabel={t.back}
                onNext={() => setStep('license')} nextLabel={t.next} nextDisabled={!fName.trim()} />
            </>
          )}

          {/* ── Step 3: license & security ── */}
          {step === 'license' && (
            <>
              <SectionTitle title={t.license} sub={t.licenseSub} />
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 flex gap-2 items-end">
                  <Field label={t.licenseKey} value={licenseKey} onChange={v => { setLicenseKey(v); setLicenseOk(false) }}
                    placeholder="ALIS-XXXX-XXXX-XXXX-XXXX" className="flex-1" />
                  <button onClick={() => setLicenseOk(licenseKey.trim().length >= 4)}
                    className="px-4 py-2 rounded-lg text-white font-semibold shadow-sm whitespace-nowrap"
                    style={{ background: licenseOk ? '#16A34A' : NEXUS_BLUE }}>
                    {licenseOk ? `✓ ${t.validated}` : t.validate}
                  </button>
                </div>
                <Field label={t.adminName} value={adminName} onChange={setAdminName} required req={t.required} className="sm:col-span-2" />
                <Field label={t.adminPhone} value={adminPhone} onChange={setAdminPhone} placeholder="+250 788 123 456" />
                <Field label={t.adminEmail} value={adminEmail} onChange={setAdminEmail} type="email" required req={t.required} />
                <div>
                  <Field label={t.masterPwd} value={pwd} onChange={setPwd} type="password" required req={t.required} />
                  {pwd.length > 0 && (
                    <div className="mt-1">
                      <div className="h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                        <div className="h-full transition-all" style={{ width: `${pwScore(pwd)}%`, background: pwScore(pwd) >= 70 ? '#16A34A' : pwScore(pwd) >= 40 ? '#D97706' : '#DC2626' }} />
                      </div>
                      <span className="text-[11px]" style={{ color: pwScore(pwd) >= 70 ? '#16A34A' : '#D97706' }}>
                        {pwScore(pwd) >= 70 ? t.pwdStrong : t.pwdWeak} · {pwScore(pwd)}%
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <Field label={t.confirmPwd} value={pwd2} onChange={setPwd2} type="password" required req={t.required} />
                  {pwd2.length > 0 && pwd !== pwd2 && <span className="text-[11px] text-red-600">{t.pwdMismatch}</span>}
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-zinc-200 p-4">
                <div className="text-center text-sm font-bold text-zinc-700 mb-3">{t.security}</div>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
                  <Toggle label={`🔐 ${t.secPQ}`}     on={secPQ}     onToggle={() => setSecPQ(v => !v)} />
                  <Toggle label={`📋 ${t.secAudit}`}   on={secAudit}  onToggle={() => setSecAudit(v => !v)} />
                  <Toggle label={`👁️ ${t.secBio}`}     on={secBio}    onToggle={() => setSecBio(v => !v)} />
                  <Toggle label={`💾 ${t.secBackup}`}  on={secBackup} onToggle={() => setSecBackup(v => !v)} />
                  <Toggle label={`🛡️ ${t.secAI}`}      on={secAI}     onToggle={() => setSecAI(v => !v)} />
                </div>
                <div className="mt-3 text-center text-[11px] italic text-zinc-400">🔑 {t.keysNote}</div>
              </div>

              <NavRow onBack={() => setStep('facility')} backLabel={t.back}
                onNext={() => setStep('staff')} nextLabel={t.next} nextDisabled={!licenseStepValid} />
            </>
          )}

          {/* ── Step 4: staff ── */}
          {step === 'staff' && (
            <>
              <SectionTitle title={t.staff} sub={t.staffSub} />
              <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
                <Field label={t.sFullName} value={sRow.fullName} onChange={v => setSRow({ ...sRow, fullName: v })} />
                <Field label={t.sMobile} value={sRow.phone} onChange={v => setSRow({ ...sRow, phone: v })} placeholder="+250 7XX XXX XXX" />
                <SelectField label={t.sRole} value={sRow.role} onChange={v => setSRow({ ...sRow, role: v })}
                  options={ROLE_KEYS.map(r => ({ value: r, label: t.roles[r] }))} />
                <button onClick={addStaff} disabled={!sRow.fullName.trim()}
                  className="px-4 py-2 rounded-lg text-white font-semibold shadow-sm disabled:opacity-50" style={{ background: '#16A34A' }}>
                  + {t.add}
                </button>
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200">
                <table className="w-full text-sm">
                  <thead style={{ background: NEXUS_BLUE }} className="text-white">
                    <tr>
                      <th className="text-left px-3 py-2 w-8">#</th>
                      <th className="text-left px-3 py-2">{t.colName}</th>
                      <th className="text-left px-3 py-2">{t.colMobile}</th>
                      <th className="text-left px-3 py-2">{t.colRole}</th>
                      <th className="text-right px-3 py-2">{t.colAction}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-5 text-center text-zinc-400">{t.noStaff}</td></tr>
                    )}
                    {staff.map((s, i) => (
                      <tr key={i} className="border-t border-zinc-100">
                        <td className="px-3 py-2 text-zinc-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-zinc-800">{s.fullName}</td>
                        <td className="px-3 py-2 text-zinc-600">{s.phone || '—'}</td>
                        <td className="px-3 py-2 text-zinc-600">{t.roles[s.role as (typeof ROLE_KEYS)[number]] ?? s.role}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => setStaff(staff.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">ℹ️ {t.smsNote}</div>

              <NavRow onBack={() => setStep('license')} backLabel={t.back}
                onNext={() => setStep('hardware')} nextLabel={t.next} />
            </>
          )}

          {/* ── Step 5: hardware ── */}
          {step === 'hardware' && (
            <>
              <SectionTitle title={t.hardware} sub={t.hardwareSub} />
              <div className="grid lg:grid-cols-3 gap-4">
                {/* This computer */}
                <div className="rounded-xl border border-zinc-200 p-4">
                  <div className="font-bold text-zinc-800 mb-3">🖥️ {t.thisComputer}</div>
                  <div className="space-y-2.5">
                    <Field label={t.compName} value={cName} onChange={setCName} small />
                    <SelectField label={t.os} value={cOS} onChange={setCOS} small options={['Ubuntu', 'Windows', 'Dual Boot'].map(v => ({ value: v, label: v }))} />
                    <SelectField label={t.ram} value={cRAM} onChange={setCRAM} small options={['8GB', '16GB', '32GB or more'].map(v => ({ value: v, label: v }))} />
                    <SelectField label={t.serverRole} value={cRole} onChange={setCRole} small options={[{ value: 'server', label: 'Server' }, { value: 'workstation', label: 'Workstation' }, { value: 'both', label: 'Both' }]} />
                    <Toggle label={t.printerConnected} on={cPrinter} onToggle={() => setCPrinter(v => !v)} />
                    {cPrinter && (
                      <>
                        <Field label={t.brand} value={cBrand} onChange={setCBrand} small placeholder="HP" />
                        <Field label={t.model} value={cModel} onChange={setCModel} small placeholder="LaserJet Pro M404" />
                        <div>
                          <span className="block text-xs font-medium text-zinc-700 mb-1">{t.printerType}</span>
                          <div className="flex gap-3 text-sm text-zinc-700">
                            {[['label', 'Label'], ['a4', 'A4'], ['both', 'Both']].map(([v, lbl]) => (
                              <label key={v} className="flex items-center gap-1 cursor-pointer">
                                <input type="radio" name="ptype" checked={cType === v} onChange={() => setCType(v)} /> {lbl}
                              </label>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Analysers */}
                <div className="rounded-xl border border-zinc-200 p-4">
                  <div className="font-bold text-zinc-800 mb-3">🧪 {t.analysers}</div>
                  <div className="space-y-2.5">
                    <Field label={t.aName} value={aRow.name} onChange={v => setARow({ ...aRow, name: v })} small placeholder="Sysmex" />
                    <Field label={t.aModel} value={aRow.model} onChange={v => setARow({ ...aRow, model: v })} small placeholder="XN-550" />
                    <SelectField label={t.aDept} value={aRow.department} onChange={v => setARow({ ...aRow, department: v })} small
                      options={['Hematology', 'Chemistry', 'Microbiology', 'Serology', 'Coagulation', 'Urinalysis'].map(v => ({ value: v, label: v }))} />
                    <div>
                      <span className="block text-xs font-medium text-zinc-700 mb-1">{t.connection}</span>
                      <div className="flex flex-col gap-1 text-sm text-zinc-700">
                        {[['manual', t.connManual], ['barcode', t.connBarcode], ['hl7_fhir', t.connHl7]].map(([v, lbl]) => (
                          <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="conn" checked={aRow.connection === v} onChange={() => setARow({ ...aRow, connection: v })} /> {lbl}
                          </label>
                        ))}
                      </div>
                    </div>
                    <button onClick={addAnalyser} disabled={!aRow.name.trim()}
                      className="w-full px-3 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50" style={{ background: NEXUS_BLUE }}>+ {t.addAnalyser}</button>
                  </div>
                  {analysers.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {analysers.map((a, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs">
                          <span className="text-zinc-700">{a.name} {a.model} · {a.department}</span>
                          <button onClick={() => setAnalysers(analysers.filter((_, j) => j !== i))} className="text-red-500">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cold chain & IoT */}
                <div className="rounded-xl border border-zinc-200 p-4">
                  <div className="font-bold text-zinc-800 mb-3">❄️ {t.coldChain}</div>
                  <div className="flex gap-1 mb-3">
                    {[['refrigerator', t.refrigerator], ['freezer', t.freezer], ['incubator', t.incubator]].map(([v, lbl]) => (
                      <button key={v} onClick={() => setDRow({ ...dRow, deviceType: v })}
                        className="flex-1 text-[11px] py-1.5 rounded-md border"
                        style={{ background: dRow.deviceType === v ? NEXUS_BLUE : 'white', color: dRow.deviceType === v ? 'white' : '#3f3f46', borderColor: '#e4e4e7' }}>{lbl}</button>
                    ))}
                  </div>
                  <div className="space-y-2.5">
                    <Field label={t.dName} value={dRow.name} onChange={v => setDRow({ ...dRow, name: v })} small placeholder="Fridge-01" />
                    <Field label={t.dLocation} value={dRow.location} onChange={v => setDRow({ ...dRow, location: v })} small placeholder="Blood Bank" />
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={t.minTemp} value={dRow.minTemp} onChange={v => setDRow({ ...dRow, minTemp: v })} small type="number" />
                      <Field label={t.maxTemp} value={dRow.maxTemp} onChange={v => setDRow({ ...dRow, maxTemp: v })} small type="number" />
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-zinc-700 mb-1">{t.iotSensor}</span>
                      <div className="flex gap-3 text-sm text-zinc-700">
                        <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={dRow.iotSensor} onChange={() => setDRow({ ...dRow, iotSensor: true })} /> {t.yes}</label>
                        <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={!dRow.iotSensor} onChange={() => setDRow({ ...dRow, iotSensor: false })} /> {t.no}</label>
                      </div>
                    </div>
                    <button onClick={addDevice} disabled={!dRow.name.trim()}
                      className="w-full px-3 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50" style={{ background: NEXUS_BLUE }}>+ {t.addDevice}</button>
                  </div>
                  {devices.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {devices.map((d, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs">
                          <span className="text-zinc-700">{d.name} · {d.location || d.deviceType} · {d.minTemp}–{d.maxTemp}°C</span>
                          <button onClick={() => setDevices(devices.filter((_, j) => j !== i))} className="text-red-500">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button onClick={() => setStep('staff')} className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700">← {t.back}</button>
                <button onClick={submit} disabled={submitting}
                  className="px-6 py-2.5 rounded-lg text-white font-semibold shadow-sm disabled:opacity-60" style={{ background: NEXUS_BLUE }}>
                  {submitting ? t.saving : `${t.finish} →`}
                </button>
              </div>
            </>
          )}

          {/* ── Step 6: complete ── */}
          {step === 'done' && (
            <div className="py-2">
              <div className="text-center">
                <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h2 className="mt-3 text-2xl font-extrabold" style={{ color: MIL_GREEN }}>{t.done}</h2>
                <p className="text-sm italic font-bold" style={{ color: GOLD_DK }}>{t.doneSub}</p>
              </div>

              <div className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm rounded-xl border border-zinc-200 p-4">
                <SumRow k={t.sumFacility} v={fName || '—'} />
                <SumRow k={t.sumSecurity} v={`${secPQ ? 'Kyber768 + Dilithium3' : 'Standard'}`} />
                <SumRow k={t.sumLabCode} v={result?.lab_code || fLabCode || '—'} />
                <SumRow k={t.sumAnalysers} v={String(result?.analysers_created ?? analysers.length)} />
                <SumRow k={t.sumLicense} v={licenseKey ? `✓ ${licenseKey.slice(0, 12)}…` : '—'} />
                <SumRow k={t.sumDevices} v={String(result?.devices_created ?? devices.length)} />
                <SumRow k={t.sumStaff} v={String(result?.staff_created ?? staff.length)} />
                <SumRow k={t.sumLang} v="English · Français · Kinyarwanda" />
              </div>

              {result && result.staff_credentials.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-bold text-amber-800 mb-2">🔑 {t.credsTitle}</div>
                  <div className="overflow-hidden rounded-lg border border-amber-200">
                    <table className="w-full text-xs bg-white">
                      <thead className="bg-amber-100 text-amber-900"><tr>
                        <th className="text-left px-2 py-1.5">{t.colName}</th>
                        <th className="text-left px-2 py-1.5">Username</th>
                        <th className="text-left px-2 py-1.5">{t.colRole}</th>
                        <th className="text-left px-2 py-1.5">Temp. password</th>
                      </tr></thead>
                      <tbody>
                        {result.staff_credentials.map((c, i) => (
                          <tr key={i} className="border-t border-amber-100">
                            <td className="px-2 py-1.5">{c.full_name}</td>
                            <td className="px-2 py-1.5 font-mono">{c.username}</td>
                            <td className="px-2 py-1.5">{c.role}</td>
                            <td className="px-2 py-1.5 font-mono">{c.temp_password}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button onClick={downloadConfig} className="px-5 py-2.5 rounded-lg border-2 font-semibold" style={{ borderColor: NEXUS_BLUE, color: NEXUS_BLUE }}>⬇ {t.download}</button>
                <button onClick={() => router.replace('/login')} className="px-6 py-2.5 rounded-lg text-white font-semibold shadow-sm" style={{ background: NEXUS_BLUE }}>{t.launch}</button>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 text-center">
                  {t.credsNote}{result && result.sms_queued > 0 ? ` — ${result.sms_queued} 📲` : ''}
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 text-center">{t.summaryNote}</div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="text-white" style={{ background: `linear-gradient(90deg, ${NEXUS_BLUE} 0%, #1565C0 100%)` }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between text-xs">
          <a href="mailto:jorinovanexus@gmail.com" className="font-medium">jorinovanexus@gmail.com</a>
          <span className="text-blue-100">{t.powered}</span>
        </div>
      </footer>
    </div>
  )
}


// ── Reusable bits ──────────────────────────────────────────────────────────────

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-zinc-900">{title}</h2>
      <p className="text-sm text-zinc-500 mt-0.5">{sub}</p>
    </div>
  )
}

function NavRow({ onBack, backLabel, onNext, nextLabel, nextDisabled }: {
  onBack: () => void; backLabel: string; onNext: () => void; nextLabel: string; nextDisabled?: boolean
}) {
  return (
    <div className="mt-6 flex justify-between">
      <button onClick={onBack} className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700">← {backLabel}</button>
      <button onClick={onNext} disabled={nextDisabled}
        className="px-5 py-2.5 rounded-lg text-white font-semibold shadow-sm disabled:opacity-50" style={{ background: NEXUS_BLUE }}>
        {nextLabel} →
      </button>
    </div>
  )
}

function Field({
  label, value, onChange, required, req, type = 'text', placeholder, className = '', small,
}: {
  label: string; value: string; onChange: (v: string) => void
  required?: boolean; req?: string; type?: string; placeholder?: string; className?: string; small?: boolean
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-zinc-700 mb-1">{label}{required && ' *'}</span>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
        className={`w-full rounded-lg border border-zinc-300 bg-white px-3 ${small ? 'py-1.5 text-xs' : 'py-2 text-sm'} text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500`}
      />
    </label>
  )
}

function SelectField({ label, value, onChange, options, className = '', small }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; className?: string; small?: boolean
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-zinc-700 mb-1">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`w-full rounded-lg border border-zinc-300 bg-white px-3 ${small ? 'py-1.5 text-xs' : 'py-2 text-sm'} text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500`}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center justify-between gap-3 text-sm text-zinc-700">
      <span className="text-left">{label}</span>
      <span className="relative inline-block h-6 w-11 rounded-full transition-colors shrink-0"
        style={{ background: on ? NEXUS_BLUE : '#CBD5E1' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
      </span>
    </button>
  )
}

function SumRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-zinc-100 py-1">
      <span className="font-semibold text-zinc-600">{k}</span>
      <span className="text-zinc-900 text-right">{v}</span>
    </div>
  )
}

function Stepper({ labels, idx }: { labels: string[]; idx: number }) {
  return (
    <div className="flex items-center">
      {labels.map((lbl, i) => {
        const done = i < idx, active = i === idx
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                style={{ background: done || active ? NEXUS_BLUE : '#E4E4E7', color: done || active ? 'white' : '#71717A', boxShadow: active ? `0 0 0 4px ${NEXUS_BLUE}22` : 'none' }}>
                {done ? '✓' : i + 1}
              </div>
              <span className="mt-1 text-[10px] font-medium text-zinc-500 hidden sm:block">{lbl}</span>
            </div>
            {i < labels.length - 1 && (
              <div className="h-0.5 flex-1 mx-1" style={{ background: i < idx ? NEXUS_BLUE : '#E4E4E7' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
