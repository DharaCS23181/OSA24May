/**
 * Power BI–style hierarchy helpers for multi-dimension drill / expand.
 */

/** How many dimension columns to include on the axis at this depth. */
export const getHierarchyDimensionCount = (depth, expandMode, totalDims) => {
    if (totalDims <= 1) return 1;
    if (expandMode) {
        return Math.min(Math.max(2, depth + 2), totalDims);
    }
    return 1;
};

export const getHierarchyDimensions = (dimensionFields, depth, expandMode) => {
    const fields = Array.isArray(dimensionFields) ? dimensionFields.filter(Boolean) : [];
    if (!fields.length) return [];
    const count = getHierarchyDimensionCount(depth, expandMode, fields.length);
    if (expandMode && fields.length > 1) {
        return fields.slice(0, count);
    }
    const idx = Math.min(Math.max(0, depth), fields.length - 1);
    return [fields[idx]];
};

export const getHierarchyXAxisLabel = (dimensionFields, depth, expandMode) => {
    const dims = getHierarchyDimensions(dimensionFields, depth, expandMode);
    if (!dims.length) return '';
    if (expandMode && dims.length > 1) {
        return dims.join(' | ');
    }
    return dims[0];
};

/** Composite filter keys used at each expand depth (for clearing). */
export const getCompositeFilterKeys = (dimensionFields, maxDepth) => {
    const fields = Array.isArray(dimensionFields) ? dimensionFields : [];
    const keys = new Set();
    for (let d = 0; d <= maxDepth && d < fields.length; d++) {
        if (d === 0) {
            keys.add(fields[0]);
        } else {
            keys.add(fields.slice(0, Math.min(d + 2, fields.length)).join(' | '));
        }
    }
    return [...keys];
};
