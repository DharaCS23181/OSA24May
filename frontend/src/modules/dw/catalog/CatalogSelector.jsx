import React, { useState } from 'react';
import { FiBook, FiDatabase, FiChevronDown } from 'react-icons/fi';

const CatalogSelector = ({ catalogs, selectedContext, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--df-sidebar-hover)]"
                style={{ color: 'var(--df-text)', border: '1px solid transparent' }}
            >
                <FiBook size={14} style={{ color: 'var(--df-text-muted)' }} />
                <span className="text-[13px] font-medium">{selectedContext.catalog}</span>
                <span className="font-black" style={{ color: 'var(--df-text-muted)' }}>.</span>
                <FiDatabase size={14} style={{ color: 'var(--df-text-muted)' }} />
                <span className="text-[13px] font-medium">{selectedContext.schema}</span>
                <FiChevronDown size={14} style={{ color: 'var(--df-text-muted)' }} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute left-0 mt-1 w-64 rounded-xl py-2 z-30 shadow-lg border" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
                        <div className="px-4 py-2 text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--df-text-muted)' }}>Select Catalog . Schema</div>
                        {catalogs && Object.entries(catalogs).map(([catName, schemas]) => (
                            <div key={catName}>
                                <div className="px-4 py-1.5 text-xs font-medium" style={{ color: 'var(--df-text)' }}>{catName}</div>
                                {Object.keys(schemas).map(schName => (
                                    <button
                                        key={schName}
                                        className="w-full text-left px-8 py-1.5 text-[13px] transition-colors hover:bg-[var(--df-sidebar-hover)]"
                                        style={{ color: 'var(--df-text-soft)' }}
                                        onClick={() => { onSelect({ catalog: catName, schema: schName }); setIsOpen(false); }}
                                    >
                                        {schName}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default CatalogSelector;
