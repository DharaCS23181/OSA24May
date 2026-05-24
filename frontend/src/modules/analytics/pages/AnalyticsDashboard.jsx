import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import BIWorkspace from '../components/BIWorkspace';

/**
 * AnalyticsDashboard Component
 * Now uses the shared BIWorkspace component for a unified experience.
 */
const AnalyticsDashboard = ({ onLogout }) => {
    const { fileId: pathFileId } = useParams();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const queryFileId = queryParams.get('fileId');
    const fileId = pathFileId || queryFileId;
    const initialFileName = queryParams.get('fileName') || undefined;
    const viewParam = queryParams.get('view');
    const initialActiveView =
      viewParam === 'connections' ? 'connections' : undefined;
    const navigate = useNavigate();
    const userId = localStorage.getItem('userId');

    const handleGoHome = () => {
        navigate('/dashboard');
    };

    const handleOpenFile = (file) => {
        if (file && file.id) {
            navigate(`/workspace/${file.id}`, { replace: true });
        }
    };

    return (
        <BIWorkspace 
            key={fileId || (initialActiveView === 'connections' ? 'connections' : 'empty')}
            fileId={fileId}
            initialFileName={initialFileName}
            initialActiveView={initialActiveView}
            userId={userId}
            onLogout={onLogout}
            onGoHome={handleGoHome}
            onOpenFile={handleOpenFile}
        />
    );
};

export default AnalyticsDashboard;
