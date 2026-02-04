export const TradeEvents = {
	CS: {
		CreateRoute: 'cs:trade:create-route',
		CancelRoute: 'cs:trade:cancel-route',
		RequestRoutes: 'cs:trade:request-routes'
	},
	SC: {
		RouteList: 'sc:trade:routes',
		RouteUpdated: 'sc:trade:route-updated',
		ShipmentStarted: 'sc:trade:shipment-started',
		ShipmentArrived: 'sc:trade:shipment-arrived'
	}
} as const
