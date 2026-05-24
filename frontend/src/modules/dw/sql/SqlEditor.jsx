import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { useTheme } from '../../../shared/context/ThemeContext';

// Configure loader to use the local assets copied to the public folder.
loader.config({
  paths: {
    vs: '/monaco-editor/min/vs',
  },
});

const SqlEditor = forwardRef(({ value, onChange, onExecute, onFormat, onSave }, ref) => {
  const { isDark } = useTheme();
  const editorRef = useRef(null);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add Ctrl/Cmd + Enter to execute query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onExecute) onExecute();
    });
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getSelectedText: () => {
      if (!editorRef.current) return '';
      const selection = editorRef.current.getSelection();
      if (!selection || selection.isEmpty()) return '';
      return editorRef.current.getModel().getValueInRange(selection);
    },
    getFullText: () => {
      if (!editorRef.current) return '';
      return editorRef.current.getValue();
    },
  }));

  return (
    <div className="flex flex-col overflow-hidden flex-1 rounded-xl min-h-0" style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-card-border)', boxShadow: 'var(--df-shadow-sm)' }}>
      <div className="flex flex-1 relative min-h-0">
        <div className="flex-1 relative flex flex-col overflow-hidden min-h-0" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
          <Editor
            height="100%"
            defaultLanguage="sql"
            theme={isDark ? 'vs-dark' : 'light'}
            value={value}
            onChange={onChange}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 16, bottom: 16 },
              fixedOverflowWidgets: true,
              smoothScrolling: true,
              mouseWheelScrollSensitivity: 1,
              fastScrollSensitivity: 5,
              fontFamily: "'JetBrains Mono', ui-monospace, Consolas, 'Courier New', monospace"
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider" style={{ backgroundColor: 'var(--df-surface)', borderTop: '1px solid var(--df-border)', color: 'var(--df-text-muted)' }}>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--df-success)' }}></div>
            Ready
          </span>
          <span style={{ color: 'var(--df-border)' }}>|</span>
          <span>Tab: main_catalog.public</span>
        </div>
        <div className="flex items-center gap-4 italic opacity-70">
          <span>Ctrl+Enter: Run</span>
          <span>Ctrl+S: Save</span>
        </div>
      </div>
    </div>
  );
});

SqlEditor.displayName = 'SqlEditor';

export default SqlEditor;
