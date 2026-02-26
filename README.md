
Avalanche Simulation — Shallow Water (Saint-Venant) Model
This project implements a real-time two-dimensional snow avalanche simulation using a simplified form of the Saint-Venant equations solved with semi-Lagrangian advection.
The objective is to simulate gravity-driven snow flow over real terrain loaded from a GeoTIFF digital elevation model.

Model Overview
The simulation is based on the Shallow Water Equations (SWE), which describe:

Mass conservation
Momentum conservation in the x-direction
Momentum conservation in the y-direction

The state variables are:

h  — snow depth
u  — velocity in the x-direction
v  — velocity in the y-direction
Z  — terrain elevation (static, loaded from DEM)

Flow is driven by the terrain gradient:

g = 9.81
Explicit time stepping
CFL-based dynamic stability control


Numerical Method
Spatial discretization:

Uniform Cartesian grid
Resolution: N x N mesh (N = 128)
Cell spacing: dx = SIZE / (N - 1)

Momentum update (central difference terrain gradient):
u += dt * (-g * dZ/dx - friction * u)
v += dt * (-g * dZ/dy - friction * v)
Advection:

Semi-Lagrangian scheme (backward particle tracing)
Bilinear interpolation for sub-cell accuracy
Small damping factor (0.999) applied per step for numerical stability

Stability:

Dynamic time step computed each frame via CFL condition:

dt = CFL * dx / max_speed
dt = min(dt, 0.05)
Boundary treatment:

Fixed zero boundary: snow depth set to zero at all edges


Terrain Model
Terrain elevation is loaded at runtime from a SRTM GeoTIFF file via a Python backend:

The backend reads a region around a given latitude/longitude coordinate
Elevation values are normalized and scaled for visualization
Vertical exaggeration is applied to emphasize slope features

Barriers are implemented by raising terrain elevation in selected cells, which creates a local gradient that deflects the flow.

Snow Source Model
Snow is added interactively by clicking on the terrain:

A Gaussian distribution is applied around the click point
Multiple load presets are available (light, medium, heavy)
The simulation begins propagating immediately upon addition


Visualization
Rendering is performed using Three.js:

Two mesh layers: terrain (static) and snow (dynamic)
Snow mesh vertex heights are updated each frame from h
Heatmap mode: vertex colors encode momentum magnitude h * sqrt(u^2 + v^2)
Momentum color scale: blue (low) to yellow to red (high)
Spherical camera system with directional controls

uvicorn app:app --reload --port 8010
