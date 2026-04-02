const { z } = require('zod');
const { error: apiError } = require('../../utils/apiResponse');

/**
 * Zod validation middleware
 * @param {z.ZodSchema} schema - The Zod schema to validate against structure { body, query, params }
 */
const validate = (schema) => async (req, res, next) => {
    try {
        await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });

        return next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const issues = error.issues || error.errors || [];
            const validationErrors = issues.map(err => ({
                field: err.path ? err.path.join('.') : 'unknown',
                message: err.message,
            }));

            return apiError(res, 'Validation Error', 400, validationErrors);
        }
        return apiError(res, 'Internal Validation Error', 500);
    }
};

module.exports = validate;
