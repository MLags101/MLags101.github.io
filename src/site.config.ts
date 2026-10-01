/** Site-wide facts that are not content entries. Edit here, used everywhere. */
export const site = {
  name: 'Michael Lagana',
  shortName: 'M. Lagana',
  initials: 'ML',
  role: 'Aerospace Engineer',
  tagline: 'I design, build and fly hardware — from flight-ready airframes to the avionics inside them.',
  description:
    'Portfolio of Michael Lagana — Georgia Tech aerospace engineering student building UAVs, robots, PCBs and flight test hardware.',
  location: 'Atlanta, GA',
  email: 'mlagana6@gatech.edu',
  links: {
    linkedin: 'https://www.linkedin.com/in/mlagana6',
    github: 'https://github.com/MLags101',
  },
  resumePdf: '/resume/Michael-Lagana-Resume.pdf',
  /** Shown in the header status line and About page. Set to '' to hide. */
  availability: 'Open to 2027 full-time & internship roles',

  education: {
    school: 'Georgia Institute of Technology',
    degree: 'B.S. Aerospace Engineering',
    detail: 'Minor in Robotics · BS/MS Honors Program',
    location: 'Atlanta, GA',
    graduation: 'Expected May 2027',
    gpa: '3.95',
    coursework: ['Thermodynamics & Fluids', 'Structural Analysis', 'Jet & Rocket Propulsion'],
  },

  nav: [
    { href: '/projects', label: 'Work' },
    { href: '/experience', label: 'Experience' },
    { href: '/research', label: 'Research' },
    { href: '/about', label: 'About' },
    { href: '/resume', label: 'Resume' },
  ],
} as const;

export type Site = typeof site;
