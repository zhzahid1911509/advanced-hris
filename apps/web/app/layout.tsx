import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Advanced HRIS · People, connected',description:'A connected workspace for your people and organization.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
