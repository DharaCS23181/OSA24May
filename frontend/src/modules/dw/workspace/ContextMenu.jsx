import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { 
  FiEdit2, FiTrash2, FiStar, FiRotateCcw, FiXCircle, FiArrowUpRight, 
  FiInfo, FiCopy, FiPlus, FiDownload, FiShare2, FiChevronRight,
  FiFolder, FiBook, FiDatabase, FiFileText, FiCode, FiArchive, FiLink, FiUpload, FiArrowRight, FiCheckCircle
} from 'react-icons/fi';

const MenuItem = ({ icon: Icon, label, onClick, danger, hasSubmenu, subMenuOpen }) => {
  return (
    <div className="px-1 py-[1.5px]">
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="w-full text-left px-3 py-1.2 flex items-center justify-between text-[12.5px] rounded-md transition-all duration-150 group"
        style={{ color: danger ? '#f87171' : 'var(--df-text)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = danger ? 'rgba(248, 113, 113, 0.1)' : 'var(--df-accent-medium)';
          if (!danger) e.currentTarget.style.color = 'var(--df-strong)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = danger ? '#f87171' : 'var(--df-text)';
        }}
      >
        <div className="flex items-center gap-2.5">
          <Icon size={13} className={`flex-shrink-0 ${danger ? 'text-red-400' : 'opacity-60 group-hover:opacity-100'}`} />
          <span className="truncate font-medium">{label}</span>
        </div>
        {hasSubmenu && <FiChevronRight size={12} className={`opacity-40 group-hover:opacity-100 transition-transform ${subMenuOpen ? 'rotate-90' : ''}`} />}
      </button>
    </div>
  );
};

const ContextMenu = ({ 
  x, y, item, onClose, 
  onRename, onDelete, onToggleFavorite, onRestore, onPermanentDelete, 
  onClone, onMove, isTrashView 
}) => {
  const menuRef = useRef(null);
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [pos, setPos] = useState({ x, y });
  const [maxH, setMaxH] = useState(500);

  React.useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const winW = document.documentElement.clientWidth;
      const winH = window.innerHeight;
      
      // Default: Anchor right edge of menu to the right edge of button (x)
      // but shift left by 32px to ensure it doesn't overlap/cut
      let newX = x - rect.width - 32; 
      let newY = y;
      
      // Right edge protection
      if (newX + rect.width > winW - 20) {
        newX = winW - rect.width - 20;
      }
      
      // Left edge protection
      if (newX < 16) newX = 16;
      
      // VERTICAL LOGIC: Open Up or Down
      const spaceBelow = winH - y;
      const spaceAbove = y;
      
      if (spaceBelow < rect.height + 20 && spaceAbove > rect.height) {
        // Not enough space below, but enough above -> Open UP
        newY = y - rect.height;
      } else {
        // Default to Down
        newY = y;
      }
      
      // Safety cap for height
      if (newY < 10) {
        newY = 10;
        setMaxH(winH - 20);
      } else if (newY + rect.height > winH) {
        setMaxH(winH - newY - 10);
      }
      
      setPos({ x: newX, y: newY });
    }
  }, [x, y]);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  const handleSubmenuToggle = (id) => setActiveSubmenu(activeSubmenu === id ? null : id);
  const handleAction = (cb) => { if (cb) cb(); onClose(); };

  const handleDownload = (format) => {
    handleAction(async () => {
      let filename = `${item.name || 'export'}.${format}`;
      let blob;

      const generateIpynbContent = (notebookItem) => {
        let cells = [];
        const isSql = notebookItem.language === 'sql' || notebookItem.type === 'query';
        const isPython = notebookItem.language === 'python';
        
        if (notebookItem.cells && Array.isArray(notebookItem.cells)) {
          // Convert actual cells
          cells = notebookItem.cells.map(c => {
            let outStr = typeof c.output === 'object' ? JSON.stringify(c.output, null, 2) : String(c.output || '');
            // Unescape literal \n if backend sent double-escaped strings
            outStr = outStr.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

            return {
              cell_type: "code",
              execution_count: 1,
              metadata: {},
              source: (c.code || c.content || "").replace(/\\n/g, '\n').split('\n').map((line, i, arr) => i === arr.length - 1 ? line : line + '\n'),
              outputs: c.output ? [{
                name: "stdout",
                output_type: "stream",
                text: outStr.split('\n').map((line, i, arr) => i === arr.length - 1 ? line : line + '\n')
              }] : []
            };
          });
        } else {
          // Mock cells based on language with standard Colab/Jupyter format
          const source = isPython 
            ? ["import pandas as pd\n", "def run():\n", `    print('Executing ${notebookItem.name}...')\n`, "run()"]
            : isSql
            ? ["SELECT *\n", "FROM public.csestudent\n", "WHERE CUSTOMER_ID = 1"]
            : [`Source code for ${notebookItem.name}`];
            
          const output = isPython
            ? [`Executing ${notebookItem.name}...\n`]
            : isSql 
            ? ["✓ Query executed successfully.\n", "Returned 80 rows in 0.62s.\n\n", "Columns: id, name, created_at, status\n"]
            : ["Output..."];

          cells.push({
            cell_type: "code",
            execution_count: 1,
            metadata: {},
            source: source,
            outputs: [{
              name: "stdout",
              output_type: "stream",
              text: output
            }]
          });
        }

        return JSON.stringify({
          cells: cells,
          metadata: {
            kernelspec: {
              display_name: isPython ? "Python 3" : "SQL",
              language: isPython ? "python" : "sql",
              name: isPython ? "python3" : "sql"
            },
            language_info: {
              name: isPython ? "python" : "sql"
            }
          },
          nbformat: 4,
          nbformat_minor: 4
        }, null, 2);
      };

      try {
        if (format === 'zip') {
          // Valid empty ZIP base64
          const zipB64 = "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==";
          const bytes = new Uint8Array(atob(zipB64).split('').map(c => c.charCodeAt(0)));
          blob = new Blob([bytes], { type: 'application/zip' });
        } else if (format === 'pdf') {
          // Valid minimal PDF base64
          const pdfB64 = "JVBERi0xLjQKMSAwIG9iaiA8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PiBlbmRvYmogMiAwIG9iaiA8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PiBlbmRvYmogMyAwIG9iaiA8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDU5NSA4NDJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4gZW5kb2JqIDQgMCBvYmogPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4gZW5kb2JqIDUgMCBvYmogPDwvTGVuZ3RoIDIxPj5zdHJlYW0KQlQvRjEgMTIgVGYgMTAgODAwIFRkKER1bW15IFBERikgVGoKRVQKZW5kc3RyZWFtIGVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1MiAwMDAwMCBuIAowMDAwMDAwMTE0IDAwMDAwIG4gCjAwMDAwMDAyMTEgMDAwMDAgbiAKMDAwMDAwMDI5OSAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNi9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjM3MQolJUVPRgo=";
          const bytes = new Uint8Array(atob(pdfB64).split('').map(c => c.charCodeAt(0)));
          blob = new Blob([bytes], { type: 'application/pdf' });
        } else if (format === 'csv') {
          const headers = 'ID,Name,Type,Language,Created At\n';
          const row = `"${item.id || ''}","${item.name || ''}","${item.type || ''}","${item.language || ''}","${item.createdAt || ''}"\n`;
          blob = new Blob([headers + row], { type: 'text/csv' });
        } else if (format === 'source') {
          if (item.type === 'folder') {
            const zip = new JSZip();
            // Generate some dummy .ipynb files inside the zip
            const pyContent = generateIpynbContent({ name: `${item.name}_python`, language: 'python' });
            const sqlContent = generateIpynbContent({ name: `${item.name}_sql`, language: 'sql' });
            
            zip.file(`${item.name}_python.ipynb`, pyContent);
            zip.file(`${item.name}_sql.ipynb`, sqlContent);
            zip.file(`README.md`, `# ${item.name}\n\nThis folder contains exported Jupyter notebooks.`);
            
            blob = await zip.generateAsync({ type: "blob" });
            filename = `${item.name || 'folder'}_export.zip`;
          } else {
            filename = `${item.name || 'export'}.ipynb`;
            const content = generateIpynbContent(item);
            blob = new Blob([content], { type: 'application/json' });
          }
        } else {
          // Default to JSON for DBC/others
          const exportData = {
            metadata: {
              name: item.name,
              type: item.type,
              language: item.language,
              exportedAt: new Date().toISOString()
            },
            content: [] // Empty notebook cells
          };
          blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Download generation failed", err);
      }
    });
  };

  const Divider = () => <div className="h-[1px] my-1 mx-2 opacity-30" style={{ backgroundColor: 'var(--df-border)' }} />;

  const SubMenuContainer = ({ children, visible }) => (
    visible ? (
      <div 
        className="absolute right-[102%] top-0 w-44 rounded-xl shadow-lg py-1.5 z-50 animate-fadeIn"
        style={{ 
          backgroundColor: 'var(--df-panel)', 
          border: '1px solid var(--df-border)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    ) : null
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-xl shadow-lg py-2 w-[205px] animate-fadeIn"
      style={{
        top: pos.y,
        left: pos.x,
        maxHeight: `${maxH}px`,
        backgroundColor: 'var(--df-panel)',
        border: '1px solid var(--df-border)',
      }}
    >
      {isTrashView ? (
        <>
          <MenuItem icon={FiRotateCcw} label="Restore" onClick={() => handleAction(() => onRestore(item))} />
          <Divider />
          <MenuItem icon={FiXCircle} label="Delete Forever" onClick={() => handleAction(() => onPermanentDelete(item))} danger />
        </>
      ) : (
        <>


          <MenuItem icon={FiEdit2} label="Rename" onClick={() => handleAction(() => onRename(item))} />
          <MenuItem icon={FiFolder} label="Move to..." onClick={() => handleAction(() => onMove(item))} />
          <MenuItem icon={FiCopy} label="Clone / Duplicate" onClick={() => handleAction(() => onClone(item))} />

          <Divider />

          <MenuItem icon={FiDownload} label="Download" onClick={() => handleDownload('source')} />

          <Divider />

          <MenuItem icon={FiTrash2} label={`Move to Trash`} onClick={() => handleAction(() => onDelete(item))} danger />
        </>
      )}
    </div>
  );
};

export default ContextMenu;
