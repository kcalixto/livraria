// Contato acionável: o passo seguinte do operador é sempre falar com o cliente.
export function ContactLink({ contact }: { contact: string }) {
  const digits = contact.replace(/\D/g, '');

  if (contact.includes('@')) {
    return (
      <a className="contact-link" href={`mailto:${contact}`}>
        {contact}
      </a>
    );
  }
  if (digits.length >= 8) {
    const withCountry = digits.length <= 11 ? `55${digits}` : digits;
    return (
      <a
        className="contact-link"
        href={`https://wa.me/${withCountry}`}
        target="_blank"
        rel="noreferrer"
      >
        {contact}
      </a>
    );
  }
  return <span>{contact}</span>;
}
