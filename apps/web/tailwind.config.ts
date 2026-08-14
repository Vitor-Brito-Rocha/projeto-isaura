import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: '#151821',
        papel: '#F1F2F4',
        registro: '#2F4A9C',
        alarme: '#B85210',
      },
    },
  },
  plugins: [],
};

export default config;
