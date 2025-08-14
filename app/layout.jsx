export const metadata = { title: 'SMSJ', description: 'Recepção de Demandas – SMS' };
import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
