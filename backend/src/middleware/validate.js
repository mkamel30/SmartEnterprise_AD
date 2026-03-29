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
            const validationErrors = error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
            }));

            return apiError(res, 'Validation Error', 400, validationErrors);
        }
        return apiError(res, 'Internal Validation Error', 500);
    }
};

module.exports = validate;
