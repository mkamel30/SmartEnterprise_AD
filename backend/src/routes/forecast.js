const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');

router.use(adminAuth);

/**
 * GET /api/reports/forecast
 * Artistic Forecast Report - Liquidity and Operational Load
 */
router.get('/', async (req, res) => {
    try {
        const { branchId, confidence = 0.9 } = req.query;
        const confidenceLevel = parseFloat(confidence);

        const now = new Date();
        const twelveMonthsFromNow = new Date();
        twelveMonthsFromNow.setMonth(now.getMonth() + 12);

        // 1. Liquidity Forecast (Installments)
        const installments = await prisma.installment.findMany({
            where: {
                isPaid: false,
                dueDate: { gte: now, lte: twelveMonthsFromNow },
                ...(branchId ? { branchId } : {})
            },
            select: {
                amount: true,
                dueDate: true
            }
        });

        const liquidityTimeline = {};
        installments.forEach(inst => {
            const monthKey = `${inst.dueDate.getFullYear()}-${String(inst.dueDate.getMonth() + 1).padStart(2, '0')}`;
            if (!liquidityTimeline[monthKey]) {
                liquidityTimeline[monthKey] = { 
                    month: monthKey, 
                    projected: 0, 
                    conservative: 0 
                };
            }
            liquidityTimeline[monthKey].projected += inst.amount;
            liquidityTimeline[monthKey].conservative += (inst.amount * confidenceLevel);
        });

        // 2. Operational Load Forecast (Based on previous year trends)
        const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 12, 0);

        const historicalRequests = await prisma.maintenanceRequest.findMany({
            where: {
                createdAt: { gte: lastYearStart, lte: lastYearEnd },
                ...(branchId ? { branchId } : {})
            },
            select: { createdAt: true }
        });

        const operationalForecast = {};
        historicalRequests.forEach(req => {
            // Shift historical dates to current/future year for prediction
            const histDate = new Date(req.createdAt);
            const forecastMonth = histDate.getMonth();
            const forecastYear = histDate.getFullYear() + 1;
            const monthKey = `${forecastYear}-${String(forecastMonth + 1).padStart(2, '0')}`;

            if (!operationalForecast[monthKey]) {
                operationalForecast[monthKey] = { 
                    month: monthKey, 
                    predictedRequests: 0,
                    intensity: 'LOW'
                };
            }
            operationalForecast[monthKey].predictedRequests += 1;
        });

        // Calculate intensities
        const counts = Object.values(operationalForecast).map(m => m.predictedRequests);
        const avg = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
        
        Object.keys(operationalForecast).forEach(key => {
            const count = operationalForecast[key].predictedRequests;
            if (count > avg * 1.5) operationalForecast[key].intensity = 'CRITICAL';
            else if (count > avg * 1.1) operationalForecast[key].intensity = 'HIGH';
            else if (count > avg * 0.8) operationalForecast[key].intensity = 'MEDIUM';
        });

        // Format final response
        const months = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const monthName = d.toLocaleString('ar-EG', { month: 'long', year: 'numeric' });
            
            months.push({
                month: monthKey,
                name: monthName,
                liquidity: liquidityTimeline[monthKey] || { projected: 0, conservative: 0 },
                operations: operationalForecast[monthKey] || { predictedRequests: 0, intensity: 'LOW' }
            });
        }

        res.json({
            success: true,
            meta: {
                generatedAt: new Date(),
                confidenceLevel,
                branchId: branchId || 'ALL_BRANCHES'
            },
            summary: {
                totalProjectedLiquidity: installments.reduce((sum, i) => sum + i.amount, 0),
                totalConservativeLiquidity: installments.reduce((sum, i) => sum + (i.amount * confidenceLevel), 0),
                peakMonth: months.sort((a, b) => b.liquidity.projected - a.liquidity.projected)[0],
                operationalPeakMonth: months.sort((a, b) => b.operations.predictedRequests - a.operations.predictedRequests)[0]
            },
            timeline: months
        });

    } catch (error) {
        logger.error('Forecast report failed:', error);
        res.status(500).json({ error: 'Failed to generate forecast report' });
    }
});

module.exports = router;
