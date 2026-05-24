import os
import pandas as pd
from dotenv import load_dotenv

# Optional: pandasai may fail on Python 3.14+ (Pydantic v1 incompatibility)
SmartDataframe = None
OpenAI = None
try:
    from pandasai import SmartDataframe
    try:
        from pandasai.llm import OpenAI
    except ImportError:
        try:
            from pandasai.llm.fake import FakeLLM as OpenAI
        except ImportError:
            from pandasai.llm.openai import OpenAI
except Exception:
    pass  # Backend still runs; smart analysis uses heuristic fallback only

load_dotenv()

class SmartAnalyzer:
    _llm = None
    
    @classmethod
    def get_llm(cls):
        if OpenAI is None:
            return None
        if cls._llm is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if api_key:
                cls._llm = OpenAI(api_key=api_key)
            else:
                # Fallback to a dummy or mention required setup
                print("WARNING: OPENAI_API_KEY not found. PandasAI will not function correctly.")
        return cls._llm

    @staticmethod
    def analyze(df: pd.DataFrame, prompt: str) -> dict:
        """
        Processes a natural language query using PandasAI or a local heuristic fallback.
        Returns a dictionary with type and data.
        """
        lower_prompt = prompt.lower()
        viz_type = "bar" # Default
        
        if "table" in lower_prompt or "show data" in lower_prompt or "list" in lower_prompt:
            viz_type = "table"
        elif any(word in lower_prompt for word in ["line", "trend", "time", "date", "over year", "over month"]):
            viz_type = "line"
        elif any(word in lower_prompt for word in ["pie", "share", "proportion", "breakdown"]):
            viz_type = "pie"
        elif "area" in lower_prompt:
            viz_type = "area"

        llm = SmartAnalyzer.get_llm()
        if not llm or SmartDataframe is None:
            # Fallback heuristic when no API key or pandasai unavailable (e.g. Python 3.14+)
            try:
                numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
                categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
                
                if numeric_cols and categorical_cols:
                    cat_col = categorical_cols[0]
                    num_col = numeric_cols[0]
                    
                    # Very basic keyword matching for columns
                    for col in categorical_cols:
                        if col.lower() in lower_prompt:
                            cat_col = col
                            break
                    for col in numeric_cols:
                        if col.lower() in lower_prompt:
                            num_col = col
                            break
                            
                    grouped_df = df.groupby(cat_col)[num_col].sum().reset_index()
                    
                    if viz_type == "pie":
                        grouped_df = grouped_df.sort_values(by=num_col, ascending=False).head(10)
                        
                    return {
                        "type": viz_type,
                        "data": grouped_df.to_dict(orient="records")
                    }
                else:
                    return {
                        "type": viz_type if viz_type == "table" else "table",
                        "data": df.head(50).to_dict(orient="records")
                    }
            except Exception as e:
                return {"type": "error", "data": f"Local analysis failed: {str(e)}"}

        if SmartDataframe is None:
            return {"type": "error", "data": "PandasAI is not available on this environment (e.g. Python 3.14+). Use a file with numeric/categorical columns for basic analysis."}

        try:
            sdf = SmartDataframe(df, config={"llm": llm})
            response = sdf.chat(prompt)
            
            # Format Data
            if isinstance(response, pd.DataFrame):
                # If AI returns a DF, it's likely a table or filtered data
                if "table" in lower_prompt:
                    viz_type = "table"
                return {
                    "type": viz_type,
                    "data": response.to_dict(orient="records")
                }
            elif isinstance(response, (list, dict)):
                return {
                    "type": viz_type,
                    "data": response
                }
            else:
                # String response or single value
                return {
                    "type": "text",
                    "data": str(response)
                }
                
        except Exception as e:
            return {"type": "error", "data": f"Error during analysis: {str(e)}"}

    @staticmethod
    def get_visualization_params(df: pd.DataFrame, prompt: str) -> dict:
        """
        Analyzes the prompt to return suggested graph parameters.
        This is a hybrid approach where we use PandasAI to identify columns.
        """
        # For now, we will reuse the existing GraphEngine logic 
        # but in a more 'smart' way if PandasAI is unavailable.
        pass
