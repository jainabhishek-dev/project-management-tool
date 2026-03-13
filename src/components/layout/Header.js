'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import styles from './Header.module.css';

export default function Header({ title, subtitle, actions }) {
  return (
    <header className={styles.header}>
      <div className={styles.titleArea}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
