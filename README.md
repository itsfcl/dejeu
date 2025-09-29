# dejeu
Multi-mode auto-differentiation library that parses plaintext equations directly

Note : this library was (and will be) tailored toward my personal use, so certain APIs or method may be esoteric or non-standard. There will also be no documentation (for now)


# Features
- Equation parsing
- Forward mode AD
- Backward mode AD
- Transformation AD (JAX-style)
- All three of the above at the same time (as they use different accumulation methods)
- (BETA) Pseudo-magic method using tagged literal ($) and cyclic hashing

# TODO
- More operators
- Greedy matching (eg : 2xy => 2*x\*y)
- Optimization (Accelerated Newton-Raphson through Halley's method, stochastic gradient descent, Powell's method for multivariate traversal)


# If I want to make this more serious
- Tensor support and ONNX compilation
- StableHLO?
- cuBLAS directly?
