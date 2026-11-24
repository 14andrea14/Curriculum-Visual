// Fuente principal: CV de Alejandra Arismendi Alvarado (Alejandra_Arismendi_CV.pdf).
// Pedido explícito: "la info del portafolio será mi CV principalmente". Todo
// lo que no sale del CV (métricas inventadas como "65% de reducción", niveles
// porcentuales de habilidades) se quitó para no mostrar datos sin respaldo.

export interface ExperienceItem {
  id: string;
  role: string;
  company: string;
  period: string;
  location: string;
  description: string;
  highlights: string[];
  techStack: string[];
  type: 'automation' | 'ai' | 'electronics' | 'freelance' | 'web' | 'other';
}

export interface SkillCategory {
  title: string;
  tag: string;
  // level es opcional: el CV lista habilidades, no porcentajes.
  skills: { name: string; level?: number; iconName?: string }[];
}

export interface ProjectItem {
  id: string;
  title: string;
  client: string;
  year: string;
  description: string;
  category: string;
  tags: string[];
  githubUrl?: string;
  demoUrl?: string;
  metrics?: string;
  award?: string;
}

export interface EducationItem {
  degree: string;
  institution: string;
  location: string;
  year: string;
  focus: string;
}

export interface CertificationItem {
  title: string;
  detail: string;
}

export const PORTFOLIO_DATA = {
  profile: {
    name: 'Alejandra Arismendi Alvarado',
    title: 'Ingeniera Electrónica | Especialista en IA y Automatización',
    location: 'Barquisimeto, Lara, Venezuela',
    phone: '(+58) 412-2247065',
    email: 'alejandra.arismendi1@gmail.com',
    linkedin: 'https://www.linkedin.com/in/alejandra-arismendi-alvarado-8098b6341',
    github: 'https://github.com/14andrea14',
    whatsapp: 'https://wa.me/584122247065',
    summary:
      'Ingeniera Electrónica especializada en inteligencia artificial aplicada y automatización de procesos. Experiencia diseñando agentes y chatbots corporativos con LLMs (Gemini, GPT, DeepSeek, Ollama) y flujos de trabajo en n8n, integrados con sistemas empresariales mediante APIs (Odoo, Veeam). Desarrollo web asistido por IA (vibecoding), creación de artefactos y skills de IA, y despliegue de servicios con Docker y Linux. Perfil analítico, orientado a resultados y con capacidad para liderar proyectos tecnológicos bajo presión.',
    statusBadge: 'DISPONIBLE PARA PROYECTOS',
    languages: [
      { name: 'Español', level: 'Nativo' },
      { name: 'Inglés', level: 'Avanzado (B2/C1)' },
    ],
  },

  experiences: [
    {
      id: 'pexum',
      role: 'Desarrolladora Web e Ingeniera de IA',
      company: 'Pexum Solutions',
      period: '2026 - Presente',
      location: 'Barquisimeto, Venezuela',
      description:
        'Desarrollo web de extremo a extremo asistido por IA, integración de LLMs en productos de clientes y automatización de procesos.',
      highlights: [
        'Desarrollo web y vibecoding: diseño, desarrollo y despliegue de sitios y aplicaciones web de extremo a extremo, acelerando la entrega con agentes de código y desarrollo asistido por IA.',
        'Inteligencia Artificial: integración de LLMs en productos y procesos de clientes; ingeniería de prompts y diseño de asistentes y agentes de IA.',
        'Artefactos y skills de IA: creación de artefactos interactivos y skills de IA reutilizables que estandarizan y automatizan tareas recurrentes.',
        'Automatizaciones: diseño de flujos de trabajo con n8n y APIs para eliminar tareas manuales e integrar sistemas entre sí.',
      ],
      techStack: ['n8n', 'LLMs', 'Prompt Engineering', 'React', 'Supabase', 'Vercel'],
      type: 'web',
    },
    {
      id: 'sosnet',
      role: 'Ingeniera de Automatización',
      company: 'SOSNET',
      period: 'Ene 2026 - Jul 2026',
      location: 'Venezuela',
      description:
        'Liderazgo técnico de un chatbot corporativo con IA para la atención interna y externa, integrado con los sistemas de la empresa.',
      highlights: [
        'Chatbot corporativo con IA: liderazgo técnico en el desarrollo de un chatbot corporativo avanzado sobre n8n para la atención interna y externa.',
        'Razonamiento con LLMs: implementación de lógica de razonamiento basada en Gemini 2.5 Flash para optimizar la calidad y rapidez de las respuestas.',
        'Integración de APIs: consumo y gestión de datos de Veeam (monitoreo de backups) y Odoo (operaciones ERP) para conectarlos al asistente.',
        'Infraestructura: entornos dockerizados para servicios de automatización, con escalabilidad y portabilidad. Capacitación en la arquitectura modular de Odoo.',
      ],
      techStack: ['n8n', 'Gemini 2.5 Flash', 'APIs REST', 'Odoo', 'Veeam', 'Docker'],
      type: 'ai',
    },
    {
      id: 'first-switch',
      role: 'Desarrolladora Junior',
      company: 'First-switch',
      period: '2024 - 2025',
      location: 'Venezuela',
      description: 'Desarrollo fullstack de sistemas y microservicios bancarios bajo metodología SCRUM.',
      highlights: [
        'Desarrollo de aplicaciones web con PHP, PostgreSQL y Java.',
        'Ejecución de proyectos bajo metodología SCRUM, garantizando la entrega de requerimientos técnicos en los tiempos establecidos.',
      ],
      techStack: ['PHP', 'Java', 'PostgreSQL', 'Microservicios', 'SCRUM'],
      type: 'web',
    },
    {
      id: 'freelance',
      role: 'Gestión de Proyectos y Diseño',
      company: 'Freelance',
      period: '2020 - 2024',
      location: 'Remoto',
      description: 'Gestión de proyectos, presentaciones ejecutivas y diseño y despliegue de sitios web.',
      highlights: [
        'Creación de planes de trabajo, organigramas y presentaciones ejecutivas mensuales con herramientas de Office.',
        'Diseño y despliegue de sitios web con herramientas de diseño (Photoshop, Canva).',
      ],
      techStack: ['Office', 'Photoshop', 'Canva', 'Diseño web'],
      type: 'freelance',
    },
    {
      id: 'tecnostore',
      role: 'Atención al Público y Logística',
      company: 'TecnoStore',
      period: '2019 - 2020',
      location: 'Barquisimeto, Venezuela',
      description: 'Atención personalizada a clientes y logística de inventario.',
      highlights: ['Seguimiento de stock, logística de inventario y atención personalizada a clientes.'],
      techStack: ['Inventario', 'Logística', 'Atención al cliente'],
      type: 'other',
    },
  ] as ExperienceItem[],

  skillCategories: [
    {
      title: 'IA & Automatización',
      tag: 'IA_AUTOMATIZACION',
      skills: [
        { name: 'n8n' },
        { name: 'Prompt Engineering' },
        { name: 'Integración de LLMs' },
        { name: 'Vibecoding' },
        { name: 'Skills de IA' },
        { name: 'Artefactos de IA' },
        { name: 'Gemini' },
        { name: 'GPT' },
        { name: 'DeepSeek' },
        { name: 'Ollama' },
      ],
    },
    {
      title: 'Desarrollo & APIs',
      tag: 'DESARROLLO_APIS',
      skills: [
        { name: 'JavaScript' },
        { name: 'Python' },
        { name: 'PHP' },
        { name: 'Java' },
        { name: 'C++' },
        { name: 'HTML/CSS' },
        { name: 'SQL (PostgreSQL, MySQL)' },
        { name: 'APIs REST (Postman)' },
      ],
    },
    {
      title: 'Infraestructura & Sistemas',
      tag: 'INFRAESTRUCTURA',
      skills: [
        { name: 'Docker' },
        { name: 'Linux (Ubuntu)' },
        { name: 'SSH' },
        { name: 'Git' },
        { name: 'VMware' },
        { name: 'WSL' },
        { name: 'Odoo ERP' },
        { name: 'Veeam' },
      ],
    },
    {
      title: 'Electrónica',
      tag: 'ELECTRONICA',
      skills: [
        { name: 'Arduino' },
        { name: 'PLC (LADDER)' },
        { name: 'SCADA' },
        { name: 'Telefonía IP' },
        { name: 'Fibra Óptica' },
      ],
    },
  ] as SkillCategory[],

  education: [
    {
      degree: 'Ingeniería Electrónica',
      institution: 'UNEXPO - Universidad Nacional Experimental Politécnica "Antonio José de Sucre"',
      location: 'Barquisimeto, Venezuela',
      year: 'Ingeniera',
      focus:
        'Trabajo de grado: Robot Educativo Interactivo con programación tangible — Primer Lugar en Creatividad e Innovación, ExpoCILARA 2025.',
    },
    {
      degree: 'Bachiller en Ciencias',
      institution: 'U.E. Colegio San Pedro',
      location: 'Barquisimeto, Venezuela',
      year: '2019',
      focus: 'Graduada con honores académicos.',
    },
  ] as EducationItem[],

  certifications: [
    { title: 'Código Seguro', detail: 'Gestión y protección de datos en el ciclo de vida del desarrollo' },
    { title: 'Controladores Lógicos Programables (PLC)', detail: 'Automatización industrial' },
    { title: 'Microcontroladores y Microprocesadores', detail: 'Programación de bajo nivel en Assembler y C++' },
    { title: 'Habilidades Supervisorias', detail: 'Resolución de conflictos y gestión de equipos' },
  ] as CertificationItem[],

  merits: [
    'Graduada con honores académicos en bachillerato (2019).',
    'Encargada de la sala de estudios y del almacén de componentes del Dpto. de Electrónica, UNEXPO (2021-2024).',
  ],

  awards: [
    {
      title: 'Primer Lugar · Premio Creatividad e Innovación 2025, categoría Creatividad',
      event: 'ExpoCILARA 2025',
      project: 'Robot Educativo Interactivo con programación tangible para el estímulo del pensamiento computacional en niños',
    },
  ],

  projects: [
    {
      id: 'sosnet-chatbot',
      title: 'Chatbot Corporativo con IA para Atención Interna y Externa',
      client: 'SOSNET',
      year: '2026',
      description:
        'Chatbot corporativo avanzado con lógica de razonamiento basada en Gemini 2.5 Flash para optimizar la atención al personal y a clientes. Consume y gestiona datos de Veeam (monitoreo de backups) y Odoo (operaciones ERP) mediante sus APIs, y se ejecuta en entornos dockerizados que garantizan escalabilidad y portabilidad.',
      category: 'IA & Automatización',
      tags: ['n8n', 'Gemini 2.5 Flash', 'APIs REST', 'Odoo', 'Veeam', 'Docker'],
    },
    {
      id: 'lion-shop',
      title: 'Chatbot de Ventas por WhatsApp con Catálogo Web e Inventario',
      client: 'Lion Shop',
      year: '2026',
      description:
        'Chatbot que atiende y gestiona las ventas al público de la tienda de ropa Lion Shop (Barquisimeto) por WhatsApp, conectado a una plataforma web de catálogo con manejo de inventario.',
      category: 'IA & Automatización',
      tags: ['WhatsApp', 'n8n', 'IA conversacional', 'Vercel'],
      demoUrl: 'https://lionshop.catalogo.pexum.app',
    },
    {
      id: 'peptis',
      title: 'Sistema Web de Inventario, CRM, Despacho y Finanzas',
      client: 'Peptis',
      year: '2026',
      description:
        'Sistema integral para la operación comercial multisede: inventario con movimientos y auditoría de stock, CRM con ficha 360° y precios personalizados, registro de ventas, tablero de despacho con rutas de delivery, verificación de pagos y panel financiero por sede. PostgreSQL en Supabase con seguridad a nivel de fila (RLS) y acceso por roles.',
      category: 'Desarrollo Web',
      tags: ['React', 'Vite', 'JavaScript', 'Supabase', 'PostgreSQL', 'Vercel'],
    },
    {
      id: 'first-switch-banking',
      title: 'Sistemas y Microservicios Bancarios',
      client: 'First-switch',
      year: '2025',
      description:
        'Desarrollo fullstack de sistemas bancarios: diseño de arquitecturas, lógica de microservicios, sistemas de privacidad y gestión de usuarios, y administración de bases de datos con información sensible. Trabajo en equipo bajo SCRUM.',
      category: 'Desarrollo Fullstack',
      tags: ['PHP', 'Java', 'PostgreSQL', 'Microservicios', 'SCRUM'],
    },
    {
      id: 'robot-educativo',
      title: 'Robot Educativo Interactivo con Programación Tangible',
      client: 'Trabajo de Grado, UNEXPO',
      year: '2025',
      description:
        'Prototipo de robot didáctico (coautoría) que estimula el pensamiento computacional en niños: robot móvil y tablero de programación tangible con bloques físicos que transmite los programas por ESP-NOW. Diseño de hardware y PCB (baterías 18650 con BMS, sensores ultrasónico, de sonido y táctil, pantalla TFT, motores y servos) y firmware en C++ con FreeRTOS.',
      category: 'Electrónica & Robótica',
      tags: ['ESP32-S3', 'FreeRTOS', 'ESP-NOW', 'C++', 'Diseño de PCB'],
      award: 'Primer Lugar en Creatividad e Innovación · ExpoCILARA 2025',
    },
  ] as ProjectItem[],
};
