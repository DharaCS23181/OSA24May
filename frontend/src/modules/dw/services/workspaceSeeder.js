import * as api from './workspaceService';

export const DEFAULT_ITEMS = [
    { name: 'Users', type: 'folder', parentId: null, isFavorite: false, isDeleted: false, isShared: false },
    { name: 'Shared', type: 'folder', parentId: null, isFavorite: false, isDeleted: false, isShared: false },
];

export const seedDefaultWorkspace = async () => {
    console.log('[WorkspaceContext] DB empty, seeding defaults...');
    const seeded = [];

    for (const item of DEFAULT_ITEMS) {
        const created = await api.createItem(item);
        seeded.push(created);
    }

    // Create user folder inside Users
    const usersFolder = seeded.find(i => i.name === 'Users');
    let userFolderId = null;
    if (usersFolder) {
        const userFolder = await api.createItem({
            name: 'user@dataforge.io',
            type: 'folder',
            parentId: usersFolder.id,
            isFavorite: false,
            isDeleted: false,
            isShared: false,
        });
        seeded.push(userFolder);
        userFolderId = userFolder.id;

        // Create example notebooks
        const nb1 = await api.createItem({
            name: 'Example SQL Notebook',
            type: 'notebook',
            parentId: userFolder.id,
            isFavorite: false, isDeleted: false, isShared: false,
            language: 'sql',
            cells: [
                { language: 'sql', content: '-- Welcome to DataForge Notebooks!\nSELECT * FROM customers LIMIT 10;', output: null },
            ],
        });
        seeded.push(nb1);

        const nb2 = await api.createItem({
            name: 'Data Analysis Notebook',
            type: 'notebook',
            parentId: userFolder.id,
            isFavorite: true, isDeleted: false, isShared: false,
            language: 'python',
            cells: [
                { language: 'python', content: '# Data analysis starter\nprint("Hello from DataForge!")', output: null },
            ],
        });
        seeded.push(nb2);
    }

    // Create shared notebook
    const sharedFolder = seeded.find(i => i.name === 'Shared');
    if (sharedFolder) {
        const sharedNb = await api.createItem({
            name: 'Team Shared Query',
            type: 'notebook',
            parentId: sharedFolder.id,
            isFavorite: false, isDeleted: false, isShared: true,
            language: 'sql',
            cells: [
                { language: 'sql', content: 'SELECT * FROM shared_metrics;', output: null },
            ],
        });
        seeded.push(sharedNb);
    }

    return { seededData: seeded, defaultUserFolderId: userFolderId };
};
