const { z } = require('zod');

const loginSchema = z.object({
    body: z.object({
        username: z.string().min(1, 'Username is required'),
        password: z.string().min(1, 'Password is required')
    })
});

const preferencesSchema = z.object({
    body: z.object({
        theme: z.string().optional(),
        fontFamily: z.string().optional(),
        themeVariant: z.string().optional()
    }).passthrough() // Allow other preferences
});

const forgotPasswordSchema = z.object({
    body: z.object({
        username: z.string().min(1, 'Username is required'),
        recoveryKey: z.string().min(1, 'Recovery key is required')
    })
});

const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string().min(1, 'Token is required'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters')
    })
});

module.exports = {
    loginSchema,
    preferencesSchema,
    forgotPasswordSchema,
    resetPasswordSchema
};
