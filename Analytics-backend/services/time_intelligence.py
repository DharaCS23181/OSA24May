import pandas as pd
from typing import Optional, Dict, List, Any

class TimeIntelligence:
    @staticmethod
    def apply_date_filters(
        df: pd.DataFrame, 
        date_col: str, 
        year: Optional[int] = None, 
        month: Optional[int] = None, 
        quarter: Optional[int] = None
    ) -> pd.DataFrame:
        if date_col not in df.columns:
            return df
        
        # Ensure date_col is datetime
        temp_df = df.copy()
        temp_df[date_col] = pd.to_datetime(temp_df[date_col], errors='coerce')
        temp_df = temp_df.dropna(subset=[date_col])
        
        mask = pd.Series(True, index=temp_df.index)
        
        if year:
            mask = mask & (temp_df[date_col].dt.year == year)
        if quarter:
            mask = mask & (temp_df[date_col].dt.quarter == quarter)
        if month:
            mask = mask & (temp_df[date_col].dt.month == month)
            
        return temp_df[mask]

    @staticmethod
    def get_date_hierarchy(df: pd.DataFrame, date_col: str) -> Dict[str, Any]:
        if date_col not in df.columns:
            return {"years": [], "months": [], "quarters": []}
            
        dates = pd.to_datetime(df[date_col], errors='coerce').dropna()
        if dates.empty:
            return {"years": [], "months": [], "quarters": []}
            
        years = sorted(dates.dt.year.unique().tolist(), reverse=True)
        quarters = sorted(dates.dt.quarter.unique().tolist())
        months = sorted(dates.dt.month.unique().tolist())
        
        # Month labels for UI
        month_map = {
            1: "January", 2: "February", 3: "March", 4: "April",
            5: "May", 6: "June", 7: "July", 8: "August",
            9: "September", 10: "October", 11: "November", 12: "December"
        }
        month_labels = [{"value": m, "label": month_map[m]} for m in months]
        
        return {
            "years": years,
            "quarters": quarters,
            "months": month_labels,
            "date_column": date_col
        }

    @staticmethod
    def compute_ytd(df: pd.DataFrame, date_col: str, val_col: str, agg: str = "sum") -> pd.DataFrame:
        """
        Groups by Year and Month, then calculates cumulative sum within each Year.
        """
        work_df = df.copy()
        work_df[date_col] = pd.to_datetime(work_df[date_col])
        work_df['Year'] = work_df[date_col].dt.year
        work_df['Month'] = work_df[date_col].dt.month
        
        # Use first day of month for normalization
        work_df['MonthGroup'] = work_df[date_col].dt.to_period('M').dt.to_timestamp()
        
        # Initial aggregation
        grouped = work_df.groupby(['Year', 'MonthGroup'])[val_col].agg(agg).reset_index()
        grouped = grouped.sort_values(['Year', 'MonthGroup'])
        
        # Cumulative sum per year
        grouped[val_col] = grouped.groupby('Year')[val_col].cumsum()
        
        return grouped

    @staticmethod
    def compute_mtd(df: pd.DataFrame, date_col: str, val_col: str, agg: str = "sum") -> pd.DataFrame:
        """
        Groups by Year, Month, and Day, then calculates cumulative sum within each Month.
        """
        work_df = df.copy()
        work_df[date_col] = pd.to_datetime(work_df[date_col])
        work_df['Year'] = work_df[date_col].dt.year
        work_df['Month'] = work_df[date_col].dt.month
        work_df['Day'] = work_df[date_col].dt.day
        
        work_df['DayGroup'] = work_df[date_col].dt.normalize()
        
        # Initial aggregation
        grouped = work_df.groupby(['Year', 'Month', 'DayGroup'])[val_col].agg(agg).reset_index()
        grouped = grouped.sort_values(['Year', 'Month', 'DayGroup'])
        
        # Cumulative sum per year/month
        grouped[val_col] = grouped.groupby(['Year', 'Month'])[val_col].cumsum()
        
        return grouped
