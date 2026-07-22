from __future__ import annotations

import builtins
import json
from functools import wraps
from typing import Any


_open = builtins.open


@wraps(_open)
def open_utf8(*args: Any, **kwargs: Any) -> Any:
    mode = args[1] if len(args) > 1 else kwargs.get("mode", "r")
    if "b" not in mode and kwargs.get("encoding") is None:
        kwargs["encoding"] = "utf-8"
    return _open(*args, **kwargs)


def prefer_utf8_file_io() -> None:
    builtins.open = open_utf8


def patch_pandas_compatibility() -> None:
    import numpy as np
    import pandas as pd

    def json_dumps_compat(obj: Any, *args: Any, **kwargs: Any) -> str:
        def default(value: Any) -> Any:
            if isinstance(value, np.integer):
                return int(value)
            if isinstance(value, np.floating):
                return float(value)
            if isinstance(value, np.ndarray):
                return value.tolist()
            if hasattr(value, "item"):
                return value.item()
            raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")

        kwargs.setdefault("default", default)
        return json.dumps(obj, *args, **kwargs)

    if not hasattr(pd.Series, "iteritems"):
        pd.Series.iteritems = pd.Series.items
    if not hasattr(pd.DataFrame, "iteritems"):
        pd.DataFrame.iteritems = pd.DataFrame.items
    if not hasattr(pd.io.json, "dumps"):
        pd.io.json.dumps = json_dumps_compat
