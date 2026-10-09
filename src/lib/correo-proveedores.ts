// Servidores de correo más comunes (la "contraseña de aplicación" se genera en la cuenta de correo)
export const PROVEEDORES_CORREO: Record<string, { nombre: string; host: string; puerto: number; ayuda: string }> = {
  gmail: { nombre: "Gmail", host: "smtp.gmail.com", puerto: 465, ayuda: "https://myaccount.google.com/apppasswords" },
  outlook: { nombre: "Outlook / Hotmail", host: "smtp-mail.outlook.com", puerto: 587, ayuda: "https://account.microsoft.com/security" },
  yahoo: { nombre: "Yahoo", host: "smtp.mail.yahoo.com", puerto: 465, ayuda: "https://login.yahoo.com/account/security" },
};
