import { useState, useCallback, useRef } from 'react';

/**
 * A specialized Undo/Redo customized hook for React Flow canvas DAG state tracking.
 * 
 * @param {Array} initialNodes - Initial nodes of the graph
 * @param {Array} initialEdges - Initial edges of the graph 
 * @param {Function} setNodes - React Flow's native setNodes handler
 * @param {Function} setEdges - React Flow's native setEdges handler
 */
export function useUndoRedo(setNodes, setEdges) {
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);

  // Use a ref to track if a change was orchestrated by undo/redo itself
  // to avoid pushing the undone state back onto the stack endlessly.
  const isUndoRedoActive = useRef(false);

  const takeSnapshot = useCallback((nodes, edges) => {
    if (isUndoRedoActive.current) return;
    setPast((prevPast) => [
      ...prevPast,
      { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }
    ]);
    setFuture([]); // If a new action happens, the future timeline collapses
  }, []);

  const undo = useCallback((currentNodes, currentEdges) => {
    if (past.length === 0) return;
    
    isUndoRedoActive.current = true;
    const previousState = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    
    setPast(newPast);
    setFuture((prevFuture) => [
      { nodes: JSON.parse(JSON.stringify(currentNodes)), edges: JSON.parse(JSON.stringify(currentEdges)) },
      ...prevFuture
    ]);
    
    setNodes(previousState.nodes);
    setEdges(previousState.edges);
    
    // allow event loop to flush before unlocking
    setTimeout(() => { isUndoRedoActive.current = false; }, 50);
  }, [past, setNodes, setEdges]);

  const redo = useCallback((currentNodes, currentEdges) => {
    if (future.length === 0) return;
    
    isUndoRedoActive.current = true;
    const nextState = future[0];
    const newFuture = future.slice(1);
    
    setPast((prevPast) => [
      ...prevPast,
      { nodes: JSON.parse(JSON.stringify(currentNodes)), edges: JSON.parse(JSON.stringify(currentEdges)) }
    ]);
    setFuture(newFuture);
    
    setNodes(nextState.nodes);
    setEdges(nextState.edges);

    setTimeout(() => { isUndoRedoActive.current = false; }, 50);
  }, [future, setNodes, setEdges]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  return {
    undo,
    redo,
    takeSnapshot,
    canUndo,
    canRedo,
    pastSize: past.length,
    futureSize: future.length
  };
}
