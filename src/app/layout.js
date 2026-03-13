import './globals.css';

export const metadata = {
  title: 'LeadSchool PM',
  description: 'Project Management Tool for LeadSchool',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
