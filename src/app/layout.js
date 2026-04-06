import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

export const metadata = {
  title: 'LeadSchool PM',
  description: 'Project Management Tool for LeadSchool',
};

// This script runs synchronously before React hydrates — no FOUC on refresh.
const themeInitScript = `
  (function() {
    try {
      var stored = localStorage.getItem('pm-theme');
      if (stored === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } catch(e) {}
  })();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
