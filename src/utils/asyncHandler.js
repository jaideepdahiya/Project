const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next))
        .catch(error => next(error))
    }
}

export {asyncHandler}

// asyncHandler is a wrapper for Express async route 
// handlers that catches rejected promises and forwards 
// errors to the error-handling middleware using next().