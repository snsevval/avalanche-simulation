from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import rasterio
from rasterio.windows import Window
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DEM_PATH = r"C:\Users\sevval\Desktop\cig-simulasyonu\backend\data\output_SRTMGL1.tif"


@app.get("/terrain")
def get_terrain(
    lat: float = Query(...),
    lon: float = Query(...),
    n: int = Query(128, ge=16, le=512),
):
    if not os.path.exists(DEM_PATH):
        return {"error": f"DEM dosyası yok: {DEM_PATH}"}

    with rasterio.open(DEM_PATH) as ds:
        # lat/lon -> pixel
        row, col = ds.index(lon, lat)

        half = n // 2
        win = Window(col - half, row - half, n, n)

        # sınır taşarsa kes
        win = win.intersection(Window(0, 0, ds.width, ds.height))

        arr = ds.read(1, window=win).astype(np.float32)

        # NoData temizle
        nodata = ds.nodata
        if nodata is not None:
            arr[arr == nodata] = np.nan
        if np.isnan(arr).any():
            m = float(np.nanmean(arr))
            arr = np.nan_to_num(arr, nan=m)

        return {
            "n": int(arr.shape[0]),
            "min": float(arr.min()),
            "max": float(arr.max()),
            "elevation": arr.tolist(),
        }