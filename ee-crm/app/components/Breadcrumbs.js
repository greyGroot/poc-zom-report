import Link from 'next/link';

export default function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav className="breadcrumb-nav" aria-label="Breadcrumb">
      <ol className="breadcrumb">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li className="breadcrumb-item" key={`${item.label}-${index}`}>
              {index > 0 && <span className="breadcrumb-separator" aria-hidden="true">›</span>}
              {isCurrent ? (
                <span aria-current="page">{item.label}</span>
              ) : (
                <Link href={item.href}>{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
